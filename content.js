let extractedData = {
  mainCss: { info: {}, variables: [] },
  defaultCss: { info: {}, variables: [] },
  currentStory: { info: {}, variables: [] }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    console.log('Received extract request');
    extractAllRelevantCSSVariables()
      .then(cssVariables => {
        console.log('CSS variables extracted successfully:', cssVariables);
        extractedData = cssVariables;
        sendResponse({ variables: extractedData });
      })
      .catch(error => {
        console.error('Error in extractAllRelevantCSSVariables:', error);
        sendResponse({
          error: 'Error extracting CSS variables',
          details: error.message
        });
      });
    return true;  // Indicates that the response is sent asynchronously
  } else if (request.action === "import") {
    importVariables(request.variables);
    sendResponse({ success: true });
  } else if (request.action === "updateVariable") {
    updateVariable(request.variable);
    sendResponse({ success: true });
  } else if (request.action === "getVariables") {
    sendResponse({ variables: extractedData });
  }
});

async function extractAllRelevantCSSVariables() {
  try {
    console.log('Starting extractAllRelevantCSSVariables');
    const iframe = document.getElementById('storybook-preview-iframe');
    console.log('Iframe found:', !!iframe);
    if (!iframe) {
      throw new Error('Storybook iframe not found');
    }

    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
    console.log('Iframe document accessed');

    const showcasedComponent = await findShowcasedComponent(iframeDocument);
    console.log('Showcased component found:', !!showcasedComponent);
    if (!showcasedComponent) {
      throw new Error('Showcased component not found');
    }

    const relevantSelectors = getAllRelevantSelectors(showcasedComponent);
    console.log('Relevant selectors:', relevantSelectors);

    const mainStylesheet = iframeDocument.querySelector('link[href*="main.css"]');
    const defaultStylesheet = iframeDocument.querySelector('link[href*="default.css"]');

    console.log('Main stylesheet found:', !!mainStylesheet);
    console.log('Default stylesheet found:', !!defaultStylesheet);

    if (!mainStylesheet || !defaultStylesheet) {
      throw new Error('Stylesheets not found');
    }

    console.log('Extracting variables from main stylesheet');
    const mainVariables = await extractCSSVariables(mainStylesheet.href, 'main', relevantSelectors);
    console.log('Extracting variables from default stylesheet');
    const defaultVariables = await extractCSSVariables(defaultStylesheet.href, 'default', relevantSelectors);
    
    console.log('Extracting variables used in showcased component');
    const showcasedComponentVariables = extractShowcasedComponentVariables(showcasedComponent);

    return {
      mainCss: mainVariables,
      defaultCss: defaultVariables,
      currentStory: {
        info: {
          componentName: showcasedComponent.tagName.toLowerCase(),
          componentId: showcasedComponent.id || 'unknown',
          componentClasses: Array.from(showcasedComponent.classList).join(' ')
        },
        variables: showcasedComponentVariables
      }
    };
  } catch (error) {
    console.error('Error in extractAllRelevantCSSVariables:', error);
    throw error;
  }
}

async function extractCSSVariables(stylesheetUrl, sourceKey, selectors) {
  try {
    console.log(`Fetching stylesheet: ${stylesheetUrl}`);
    const response = await fetch(stylesheetUrl, { mode: 'cors' });  // Explicitly request CORS
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cssText = await response.text();
    console.log(`Stylesheet fetched, size: ${cssText.length} characters`);
    const info = {
      url: stylesheetUrl,
      size: cssText.length
    };
    const variables = extractVariablesFromText(cssText, sourceKey, stylesheetUrl, selectors);
    console.log(`Extracted ${variables.length} variables from ${sourceKey}`);
    return { info, variables };
  } catch (error) {
    console.error(`Error extracting CSS variables from ${stylesheetUrl}:`, error);
    return { info: {}, variables: [] };
  }
}

function extractVariablesFromText(cssText, sourceKey, origin, selectors) {
  console.log(`Extracting variables from ${sourceKey}`);
  const variables = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString('<style>' + cssText + '</style>', 'text/html');
  const styleElement = doc.querySelector('style');
  const styleSheet = styleElement.sheet;

  console.log(`Number of CSS rules: ${styleSheet.cssRules.length}`);

  for (let i = 0; i < styleSheet.cssRules.length; i++) {
    const rule = styleSheet.cssRules[i];
    if (rule.type === CSSRule.STYLE_RULE) {
      const styleText = rule.style.cssText;
      const variableRegex = /(--.+?):\s*(.+?);/g;
      let match;
      while ((match = variableRegex.exec(styleText)) !== null) {
        const varName = match[1];
        const varValue = match[2];
        variables.push({
          id: `${sourceKey}-${varName.substring(2)}`,
          name: varName,
          selector: rule.selectorText,
          value: varValue,
          alias: varValue.startsWith('var(') ? varValue.match(/var\((.*?)\)/)[1] : null,
          origin: origin
        });
      }
    }
  }

  console.log(`Extracted ${variables.length} variables from ${sourceKey}`);
  return variables;
}

function extractShowcasedComponentVariables(component) {
  console.log('Extracting variables used in showcased component');
  const usedVariables = new Map();

  function extractFromElement(element) {
    const computedStyle = window.getComputedStyle(element);
    const elementSelector = getElementSelector(element);

    for (let i = 0; i < computedStyle.length; i++) {
      const prop = computedStyle[i];
      const value = computedStyle.getPropertyValue(prop);

      if (prop.startsWith('--')) {
        if (!usedVariables.has(prop)) {
          usedVariables.set(prop, {
            name: prop,
            value: value,
            usedIn: [elementSelector]
          });
        } else {
          const variable = usedVariables.get(prop);
          if (!variable.usedIn.includes(elementSelector)) {
            variable.usedIn.push(elementSelector);
          }
        }
      }
    }

    // Check for any inline styles using CSS variables
    const inlineStyles = element.getAttribute('style');
    if (inlineStyles) {
      const variableRegex = /var\((--[^,)]+)/g;
      let match;
      while ((match = variableRegex.exec(inlineStyles)) !== null) {
        const varName = match[1];
        if (!usedVariables.has(varName)) {
          usedVariables.set(varName, {
            name: varName,
            value: computedStyle.getPropertyValue(varName),
            usedIn: [elementSelector]
          });
        } else {
          const variable = usedVariables.get(varName);
          if (!variable.usedIn.includes(elementSelector)) {
            variable.usedIn.push(elementSelector);
          }
        }
      }
    }

    // Recursively check child elements
    Array.from(element.children).forEach(extractFromElement);
  }

  function getElementSelector(element) {
    return element.tagName.toLowerCase() +
           (element.id ? `#${element.id}` : '') + 
           (element.className ? `.${element.className.split(' ').join('.')}` : '');
  }

  extractFromElement(component);

  const uniqueVariables = Array.from(usedVariables.values());
  console.log(`Found ${uniqueVariables.length} unique variables used in showcased component`);
  return uniqueVariables;
}

async function findShowcasedComponent(iframeDocument) {
  console.log('Finding showcased component');
  return new Promise((resolve) => {
    const checkComponent = () => {
      const component = iframeDocument.querySelector('storybook-root > *');
      if (component) {
        console.log('Showcased component found');
        resolve(component);
      } else {
        console.log('Showcased component not found, retrying...');
        setTimeout(checkComponent, 100);  // Check again after 100ms
      }
    };
    checkComponent();
  });
}

function getAllRelevantSelectors(element) {
  console.log('Getting all relevant selectors');
  const selectors = new Set();
  
  function addSelectorsForElement(el) {
    selectors.add(el.tagName.toLowerCase());
    el.classList.forEach(className => selectors.add('.' + className));
    if (el.id) selectors.add('#' + el.id);
    
    for (let attr of el.attributes) {
      if (attr.name !== 'class' && attr.name !== 'id') {
        selectors.add(`[${attr.name}]`);
      }
    }

    for (let child of el.children) {
      addSelectorsForElement(child);
    }
  }

  addSelectorsForElement(element);
  console.log(`Found ${selectors.size} relevant selectors`);
  return Array.from(selectors);
}

function importVariables(variables) {
  extractedData = variables;
  applyVariablesToShowcasedComponent(variables);
}

function applyVariablesToShowcasedComponent(variables) {
  const iframe = document.getElementById('storybook-preview-iframe');
  if (!iframe) {
    console.error('Storybook iframe not found');
    return;
  }

  try {
    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
    const showcasedComponent = iframeDocument.querySelector('storybook-root > *');
    if (!showcasedComponent) {
      console.error('Showcased component not found');
      return;
    }

    // Combine variables from main and skin
    const allVariables = { ...variables.main, ...variables.skin };

    // Apply variables to the showcased component
    for (const [key, value] of Object.entries(allVariables)) {
      showcasedComponent.style.setProperty(key, value);
    }

    console.log('CSS variables applied successfully!');
  } catch (e) {
    console.error('Error applying CSS variables:', e);
  }
}

function updateVariable(variable) {
  for (const source in extractedData) {
    const index = extractedData[source].variables.findIndex(v => v.id === variable.id);
    if (index !== -1) {
      extractedData[source].variables[index] = variable;
      break;
    }
  }
  applyVariablesToShowcasedComponent(extractedData);
}

console.log('CSS Variable Extractor script loaded');