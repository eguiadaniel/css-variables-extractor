// content.js
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
        extractedData = cssVariables;
        sendResponse({variables: extractedData});
      })
      .catch(error => {
        console.error('Error extracting CSS variables:', error);
        sendResponse({error: 'Error extracting CSS variables'});
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

async function extractAllRelevantCSSVariables() {
  const iframe = document.getElementById('storybook-preview-iframe');
  if (!iframe) {
    console.error('Storybook iframe not found');
    return {};
  }

  const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

  const mainStylesheet = iframeDocument.querySelector('link[href*="main.css"]');
  const defaultStylesheet = iframeDocument.querySelector('link[href*="default.css"]');

  if (!mainStylesheet || !defaultStylesheet) {
    console.error('One or both stylesheets not found');
    return {};
  }

  const mainVariables = await extractCSSVariables(mainStylesheet.href, 'mainCss');
  const defaultVariables = await extractCSSVariables(defaultStylesheet.href, 'defaultCss');
  const currentStoryVariables = extractCurrentStoryVariables(iframeDocument);

  return {
    mainCss: mainVariables,
    defaultCss: defaultVariables,
    currentStory: currentStoryVariables
  };
}

async function extractCSSVariables(stylesheetUrl, sourceKey) {
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
    const variables = extractVariablesFromText(cssText, sourceKey, stylesheetUrl);
    return { info, variables };
  } catch (error) {
    console.error(`Error fetching stylesheet ${stylesheetUrl}:`, error);
    return { info: {}, variables: [] };
  }
}

function extractVariablesFromText(cssText, sourceKey, origin) {
  const variables = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString('<style>' + cssText + '</style>', 'text/html');
  const styleElement = doc.querySelector('style');
  const styleSheet = styleElement.sheet;

  for (let i = 0; i < styleSheet.cssRules.length; i++) {
    const rule = styleSheet.cssRules[i];
    if (rule.type === CSSRule.STYLE_RULE) {
      const selector = rule.selectorText;
      const styleText = rule.style.cssText;
      const variableRegex = /(--.+?):\s*(.+?);/g;
      let match;
      while ((match = variableRegex.exec(styleText)) !== null) {
        const varName = match[1];
        const varValue = match[2];
        variables.push({
          id: `${sourceKey}-${varName.substring(2)}`,
          name: varName,
          selector: selector,
          value: varValue,
          alias: varValue.startsWith('var(') ? varValue.match(/var\((.*?)\)/)[1] : null,
          origin: origin
        });
      }
    }
  }

  return variables;
}

function extractCurrentStoryVariables(iframeDocument) {
  const showcasedComponent = findShowcasedComponent(iframeDocument);
  if (!showcasedComponent) {
    console.error('Showcased component not found');
    return { info: {}, variables: [] };
  }

  const info = {
    componentName: showcasedComponent.tagName.toLowerCase(),
    componentId: showcasedComponent.id || 'unknown'
  };

  const variables = [];
  const computedStyle = window.getComputedStyle(showcasedComponent);
  for (let i = 0; i < computedStyle.length; i++) {
    const prop = computedStyle[i];
    if (prop.startsWith('--')) {
      const value = computedStyle.getPropertyValue(prop).trim();
      variables.push({
        id: `currentStory-${prop.substring(2)}`,
        name: prop,
        selector: showcasedComponent.tagName.toLowerCase(),
        value: value,
        alias: value.startsWith('var(') ? value.match(/var\((.*?)\)/)[1] : null,
        origin: 'currentStory'
      });
    }
  }

  return { info, variables };
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