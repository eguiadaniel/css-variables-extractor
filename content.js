let extractedData = {
  mainCss: { info: {}, variables: [] },
  defaultCss: { info: {}, variables: [] },
  currentStory: { info: {}, variables: [] }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  if (request.action === "extract") {
    console.log('Starting extraction process');
    extractAllRelevantCSSVariables()
      .then(cssVariables => {
        console.log('Extraction complete, sending response:', cssVariables);
        extractedData = cssVariables;
        sendResponse({variables: extractedData});
      })
      .catch(error => {
        console.error('Error extracting CSS variables:', error);
        sendResponse({error: 'Error extracting CSS variables', details: error.message});
      });
    return true; // Indicates we wish to send a response asynchronously
  } else if (request.action === "import") {
    importVariables(request.variables);
    sendResponse({success: true});
  } else if (request.action === "updateVariable") {
    updateVariable(request.variable);
    sendResponse({success: true});
  } else if (request.action === "getVariables") {
    sendResponse({variables: extractedData});
  }
});

async function extractAllRelevantCSSVariables(retryCount = 0, maxRetries = 5) {
  console.log(`Starting variable extraction process (attempt ${retryCount + 1})`);
  
  const iframe = document.getElementById('storybook-preview-iframe');
  if (!iframe) {
    console.error('Storybook iframe not found');
    return { error: 'Storybook iframe not found' };
  }
  console.log('Storybook iframe found');

  const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
  console.log('Accessed iframe document');

  // Add a delay to ensure the component is rendered
  await new Promise(resolve => setTimeout(resolve, 2000));

  const showcasedComponent = await findShowcasedComponent(iframeDocument);
  if (!showcasedComponent) {
    if (retryCount < maxRetries) {
      console.log(`Retrying extraction in 2 seconds (attempt ${retryCount + 2})`);
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(extractAllRelevantCSSVariables(retryCount + 1, maxRetries));
        }, 2000);
      });
    }
    console.error('Showcased component not found after multiple attempts');
    return { error: 'Showcased component not found after multiple attempts' };
  }
  console.log('Showcased component found:', showcasedComponent.tagName);

  const relevantSelectors = getAllRelevantSelectors(showcasedComponent);
  console.log('Relevant selectors:', relevantSelectors);

  const mainStylesheet = iframeDocument.querySelector('link[href*="main.css"]');
  const defaultStylesheet = iframeDocument.querySelector('link[href*="default.css"]');

  if (!mainStylesheet || !defaultStylesheet) {
    console.error('One or both stylesheets not found');
    return { 
      error: 'Stylesheets not found', 
      mainStylesheet: mainStylesheet ? mainStylesheet.href : 'Not found',
      defaultStylesheet: defaultStylesheet ? defaultStylesheet.href : 'Not found'
    };
  }
  console.log('Stylesheets found:', 
    { main: mainStylesheet.href, default: defaultStylesheet.href });

  try {
    console.log('Extracting variables from main.css');
    const mainVariables = await extractCSSVariables(mainStylesheet.href, 'mainCss', relevantSelectors);
    console.log('Main variables extracted:', mainVariables);

    console.log('Extracting variables from default.css');
    const defaultVariables = await extractCSSVariables(defaultStylesheet.href, 'defaultCss', relevantSelectors);
    console.log('Default variables extracted:', defaultVariables);

    console.log('Extracting current story variables');
    const currentStoryVariables = extractCurrentStoryVariables(showcasedComponent);
    console.log('Current story variables extracted:', currentStoryVariables);

    const result = {
      mainCss: mainVariables,
      defaultCss: defaultVariables,
      currentStory: currentStoryVariables
    };
    console.log('Final extracted data:', result);
    return result;
  } catch (error) {
    console.error('Error during variable extraction:', error);
    return { error: 'Error during variable extraction', details: error.message };
  }
}

async function extractCSSVariables(stylesheetUrl, sourceKey, selectors) {
  try {
    const response = await fetch(stylesheetUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cssText = await response.text();
    const info = {
      url: stylesheetUrl,
      size: cssText.length
    };
    const variables = extractVariablesFromText(cssText, sourceKey, stylesheetUrl, selectors);
    return { info, variables };
  } catch (error) {
    console.error(`Error fetching stylesheet ${stylesheetUrl}:`, error);
    return { info: {}, variables: [] };
  }
}

function extractVariablesFromText(cssText, sourceKey, origin, selectors) {
  const variables = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString('<style>' + cssText + '</style>', 'text/html');
  const styleElement = doc.querySelector('style');
  const styleSheet = styleElement.sheet;

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

function extractCurrentStoryVariables(component) {
  console.log('Extracting variables from current story component:', component);

  const info = {
    componentName: component.tagName.toLowerCase(),
    componentId: component.id || 'unknown',
    componentClasses: Array.from(component.classList).join(' ')
  };

  console.log('Component info:', info);

  const variables = [];

  function extractFromElement(element, depth = 0) {
    console.log(`Examining element at depth ${depth}:`, element);

    const computedStyle = window.getComputedStyle(element);
    let elementVariables = 0;

    for (let i = 0; i < computedStyle.length; i++) {
      const prop = computedStyle[i];
      if (prop.startsWith('--')) {
        const value = computedStyle.getPropertyValue(prop).trim();
        variables.push({
          id: `currentStory-${prop.substring(2)}`,
          name: prop,
          selector: getUniqueSelector(element),
          value: value,
          alias: value.startsWith('var(') ? value.match(/var\((.*?)\)/)[1] : null,
          origin: 'currentStory'
        });
        elementVariables++;
      }
    }

    console.log(`Found ${elementVariables} variables for element:`, element);

    for (let child of element.children) {
      extractFromElement(child, depth + 1);
    }
  }

  function getUniqueSelector(element) {
    if (element.id) {
      return '#' + element.id;
    }
    let selector = element.tagName.toLowerCase();
    if (element.className) {
      selector += '.' + Array.from(element.classList).join('.');
    }
    if (element.parentElement) {
      return getUniqueSelector(element.parentElement) + ' > ' + selector;
    }
    return selector;
  }

  extractFromElement(component);

  console.log(`Total variables extracted from current story: ${variables.length}`);
  return { info, variables };
}

async function findShowcasedComponent(doc, retryCount = 0, maxRetries = 5) {
  console.log(`Searching for showcased component (attempt ${retryCount + 1})`);
  
  const selectors = [
    '#storybook-root > *:not(script):not(style)',
    '.sb-show-main > *:not(script):not(style)',
    '[id^="story--"] > *:not(script):not(style)',
    '.sb-show-main [id^="story--"] > *:not(script):not(style)',
    '#storybook-preview-wrapper .innerZoomElementWrapper > *:not(script):not(style)'
  ];

  for (let selector of selectors) {
    console.log(`Trying selector: ${selector}`);
    const elements = doc.querySelectorAll(selector);
    console.log(`Found ${elements.length} elements with selector ${selector}`);
    
    for (let element of elements) {
      if (element.tagName.toLowerCase() !== 'div' && 
          !element.tagName.toLowerCase().startsWith('storybook-') &&
          !element.tagName.toLowerCase().startsWith('ng-')) {
        console.log(`Showcased component found: <${element.tagName.toLowerCase()}>`, element);
        return element;
      }
    }
  }

  // Fallback: Look for any element with children
  console.log('No suitable component found, trying fallback method');
  const allElements = doc.querySelectorAll('#storybook-root *, .sb-show-main *');
  for (let element of allElements) {
    if (element.children.length > 0 && element.tagName.toLowerCase() !== 'script' && element.tagName.toLowerCase() !== 'style') {
      console.log(`Fallback: potential showcased component found: <${element.tagName.toLowerCase()}>`, element);
      return element;
    }
  }

  if (retryCount < maxRetries) {
    console.log(`Retrying in 2 seconds (attempt ${retryCount + 2})`);
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(findShowcasedComponent(doc, retryCount + 1, maxRetries));
      }, 2000);
    });
  }

  console.error('Could not find showcased component after multiple attempts');
  return null;
}

console.log('Content script loaded');

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
    const showcasedComponent = findShowcasedComponent(iframeDocument);
    if (!showcasedComponent) {
      console.error('Showcased component not found');
      return;
    }

    for (const source in variables) {
      for (const variable of variables[source].variables) {
        showcasedComponent.style.setProperty(variable.name, variable.value);
      }
    }
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

// Initial extraction of variables when the script loads
extractAllRelevantCSSVariables()
  .then(cssVariables => {
    extractedData = cssVariables;
  })
  .catch(error => {
    console.error('Error extracting initial CSS variables:', error);
  });

console.log('Content script loaded');