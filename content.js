let extractedData = {
  mainCss: { info: {}, variables: [] },
  defaultCss: { info: {}, variables: [] },
  currentStory: { info: {}, variables: [] }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  if (request.action === "extract") {
    extractAllRelevantCSSVariables()
      .then(cssVariables => {
        sendResponse({variables: cssVariables});
      })
      .catch(error => {
        console.error('Error extracting CSS variables:', error);
        sendResponse({error: 'Error extracting CSS variables'});
      });
    return true; // Indicates we wish to send a response asynchronously
  } else if (request.action === "import") {
    currentVariables = request.variables;
    applyCSSVariablesToShowcasedComponent(currentVariables);
    sendResponse({success: true});
  } else if (request.action === "updateVariable") {
    updateVariable(request.variable);
    sendResponse({success: true});
  } else if (request.action === "getVariables") {
    sendResponse({variables: currentVariables});
  }
});

async function extractAllRelevantCSSVariables() {
  const iframe = document.getElementById('storybook-preview-iframe');
  if (!iframe) {
    console.error('Storybook iframe not found');
    return extractedData;
  }

  const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

  const showcasedComponent = findShowcasedComponent(iframeDocument);
  if (!showcasedComponent) {
    console.error('Showcased component not found');
    return extractedData;
  }

  const relevantSelectors = getAllRelevantSelectors(showcasedComponent);

  const mainStylesheet = iframeDocument.querySelector('link[href="main.css"]');
  const skinStylesheet = iframeDocument.querySelector('link#skin-stylesheet');

  if (!mainStylesheet || !skinStylesheet) {
    console.error('One or both stylesheets not found');
    return extractedData;
  }

  extractedData.mainCss.variables = await extractCSSVariablesForSelectors(mainStylesheet.href, 'mainCss', 'main', null);
  extractedData.defaultCss.variables = await extractCSSVariablesForSelectors(skinStylesheet.href, 'defaultCss', 'skin', null);

  const mainVariables = await extractCSSVariablesForSelectors(mainStylesheet.href, 'currentStory', 'main', relevantSelectors);
  const skinVariables = await extractCSSVariablesForSelectors(skinStylesheet.href, 'currentStory', 'skin', relevantSelectors);
  extractedData.currentStory.variables = [...mainVariables, ...skinVariables];

  return extractedData;
}

function findShowcasedComponent(doc) {
  // Try different selectors to find the showcased component
  const selectors = [
    '#storybook-root > storybook-root > *:not(storybook-root)',
    '#storybook-root > *:not(storybook-root)',
    '#storybook-root storybook-root > *:not(storybook-root)',
    '#root > *',
    '.sb-show-main > *'
  ];

  for (let selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    for (let element of elements) {
      if (element.tagName.toLowerCase() !== 'storybook-root' && !element.tagName.toLowerCase().startsWith('ng-')) {
        return element;
      }
    }
  }

  // If no matching element found, return the first non-storybook-root child of #storybook-root
  const rootChildren = doc.querySelectorAll('#storybook-root > *');
  for (let child of rootChildren) {
    if (child.tagName.toLowerCase() !== 'storybook-root') {
      return child;
    }
  }

  console.error('Could not find showcased component');
  return null;
}

function getAllRelevantSelectors(element) {
  const selectors = new Set();
  
  function addSelectorsForElement(el) {
    selectors.add(el.tagName.toLowerCase());
    el.classList.forEach(className => selectors.add('.' + className));
    if (el.id) selectors.add('#' + el.id);
    
    // Add attribute selectors
    for (let attr of el.attributes) {
      if (attr.name !== 'class' && attr.name !== 'id') {
        selectors.add(`[${attr.name}]`);
      }
    }

    // Recursively process child elements
    for (let child of el.children) {
      addSelectorsForElement(child);
    }
  }

  addSelectorsForElement(element);
  return Array.from(selectors);
}
  
async function extractCSSVariablesForSelectors(stylesheetUrl, sourceKey, origin, selectors = null) {
  try {
    const response = await fetch(stylesheetUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cssText = await response.text();
    return extractVariablesFromText(cssText, sourceKey, origin, selectors);
  } catch (error) {
    console.error(`Error fetching stylesheet ${stylesheetUrl}:`, error);
    return [];
  }
}
  
function extractVariablesFromText(cssText, sourceKey, origin, selectors) {
  console.log(`Extracting variables from ${sourceKey}`);
  const variables = [];
  const variableMap = new Map();
  const parser = new DOMParser();
  const doc = parser.parseFromString('<style>' + cssText + '</style>', 'text/html');
  const styleElement = doc.querySelector('style');
  const styleSheet = styleElement.sheet;
  console.log(`Number of CSS rules: ${styleSheet.cssRules.length}`);

  // First pass: collect all variables
  for (let i = 0; i < styleSheet.cssRules.length; i++) {
    const rule = styleSheet.cssRules[i];
    if (rule.type === CSSRule.STYLE_RULE) {
      if (selectors === null || ruleMatchesSelectors(rule, selectors)) {
        const styleText = rule.style.cssText;
        const variableRegex = /(--.+?):\s*(.+?);/g;
        let match;
        while ((match = variableRegex.exec(styleText)) !== null) {
          const varName = match[1];
          const varValue = match[2];
          variableMap.set(varName, varValue);
        }
      }
    }
  }

  // Second pass: resolve variables and create final structure
  for (let [varName, varValue] of variableMap) {
    const resolvedValue = resolveVariableValue(varValue, variableMap);
    const firstAlias = varValue.startsWith('var(') ? varValue.match(/var\((.*?)\)/)[1] : null;
    
    variables.push({
      id: `${sourceKey}-${varName.substring(2)}`,
      name: varName,
      selector: '', // We might need to store this separately if needed
      value: resolvedValue,
      alias: firstAlias,
      origin: origin
    });
  }
  
  console.log(`Extracted ${variables.length} variables from ${sourceKey}`);
  return variables;
}

function resolveVariableValue(value, variableMap) {
  if (!value.startsWith('var(')) {
    return value; // Base case: not a variable reference
  }

  const varName = value.match(/var\((.*?)\)/)[1];
  const resolvedValue = variableMap.get(varName);

  if (!resolvedValue) {
    return value; // Variable not found, return original value
  }

  // Recursive case: resolve the next variable in the chain
  return resolveVariableValue(resolvedValue, variableMap);
}

function ruleMatchesSelectors(rule, selectors) {
  if (!selectors || selectors.length === 0) {
    return true;  // If no selectors provided, match all rules
  }
  const ruleSelectors = rule.selectorText.split(',').map(s => s.trim());
  return ruleSelectors.some(selector => selectors.includes(selector));
}
  
  function applyCSSVariablesToShowcasedComponent(variables) {
    const iframe = document.getElementById('storybook-preview-iframe');
    if (!iframe) {
      console.error('Storybook iframe not found');
      return;
    }
  
    try {
      const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
      const showcasedComponent = findShowcasedComponent(iframeDocument);
      if (!showcasedComponent) {
        console.error('Showcased component not found');
        return;
      }
  
      applyVariablesToElementAndChildren(showcasedComponent, variables);
    } catch (e) {
      console.error('Error applying CSS variables:', e);
    }
  }
  
  function applyVariablesToElementAndChildren(element, variables) {
    for (const [key, value] of Object.entries(variables)) {
      element.style.setProperty(key, value);
    }
  
    for (let child of element.children) {
      applyVariablesToElementAndChildren(child, variables);
    }
  }
  
  function updateVariable(variable) {
    Object.assign(currentVariables, variable);
    applyCSSVariablesToShowcasedComponent(variable);
  }
  
  // Initial extraction of variables when the script loads
  extractAllRelevantCSSVariables()
  .then(cssVariables => {
    extractedData = cssVariables;
  })
  .catch(error => {
    console.error('Error extracting initial CSS variables:', error);
  });

console.log('Content script loaded');