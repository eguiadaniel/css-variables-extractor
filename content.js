// content.js
let variableEditorWindow = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  if (request.action === "extract") {
    extractAllRelevantCSSVariables()
      .then(cssVariables => {
        chrome.storage.local.set({cssVariables}, () => {
          alert('CSS variables extracted successfully!');
        });
      })
      .catch(error => {
        console.error('Error extracting CSS variables:', error);
        alert('Error extracting CSS variables. Check the console for details.');
      });
  } else if (request.action === "import") {
    applyCSSVariablesToShowcasedComponent(request.variables);
  } else if (request.action === "openVariableEditor") {
    openVariableEditor();
  } else if (request.action === "updateVariable") {
    updateVariable(request.variable);
  }
});
  
  async function extractAllRelevantCSSVariables() {
    const iframe = document.getElementById('storybook-preview-iframe');
    if (!iframe) {
      console.error('Storybook iframe not found');
      return {};
    }
  
    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
  
    // Find the showcased component
    const showcasedComponent = iframeDocument.querySelector('storybook-root > div > *');
    if (!showcasedComponent) {
      console.error('Showcased component not found');
      return {};
    }
  
    const relevantSelectors = getAllRelevantSelectors(showcasedComponent);
  
    const mainStylesheet = iframeDocument.querySelector('link[href="main.css"]');
    const skinStylesheet = iframeDocument.querySelector('link#skin-stylesheet');
  
    if (!mainStylesheet || !skinStylesheet) {
      console.error('One or both stylesheets not found');
      return {};
    }
  
    const mainVariables = await extractCSSVariablesForSelectors(mainStylesheet.href, relevantSelectors);
    const skinVariables = await extractCSSVariablesForSelectors(skinStylesheet.href, relevantSelectors);
  
    return {
      main: mainVariables,
      skin: skinVariables
    };
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
  
  async function extractCSSVariablesForSelectors(stylesheetUrl, selectors) {
    try {
      const response = await fetch(stylesheetUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const cssText = await response.text();
      return extractVariablesFromText(cssText, selectors);
    } catch (error) {
      console.error(`Error fetching stylesheet ${stylesheetUrl}:`, error);
      return {};
    }
  }
  
  function extractVariablesFromText(cssText, selectors) {
    const variables = {};
    const parser = new DOMParser();
    const doc = parser.parseFromString('<style>' + cssText + '</style>', 'text/html');
    const styleElement = doc.querySelector('style');
    const styleSheet = styleElement.sheet;
  
    for (let i = 0; i < styleSheet.cssRules.length; i++) {
      const rule = styleSheet.cssRules[i];
      if (rule.type === CSSRule.STYLE_RULE) {
        const ruleSelectors = rule.selectorText.split(',').map(s => s.trim());
        if (ruleSelectors.some(selector => selectors.includes(selector))) {
          const styleText = rule.style.cssText;
          const variableRegex = /(--.+?):\s*(.+?);/g;
          let match;
          while ((match = variableRegex.exec(styleText)) !== null) {
            variables[match[1]] = match[2];
          }
        }
      }
    }
  
    return variables;
  }
  
  function applyCSSVariablesToShowcasedComponent(variables) {
    const iframe = document.getElementById('storybook-preview-iframe');
    if (!iframe) {
      console.error('Storybook iframe not found');
      return;
    }
  
    try {
      const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
      const showcasedComponent = iframeDocument.querySelector('storybook-root > div > *');
      if (!showcasedComponent) {
        console.error('Showcased component not found');
        return;
      }
  
      // Combine variables from main and skin
      const allVariables = {...variables.main, ...variables.skin};
  
      // Apply variables to the showcased component
      for (const [key, value] of Object.entries(allVariables)) {
        showcasedComponent.style.setProperty(key, value);
      }
  
      alert('CSS variables applied successfully!');
    } catch (e) {
      console.error('Error applying CSS variables:', e);
      alert('Error applying CSS variables. Check the console for details.');
    }
  }

  
  function openVariableEditor() {
    console.log('Opening variable editor');
    if (variableEditorWindow && !variableEditorWindow.closed) {
      console.log('Focusing existing window');
      variableEditorWindow.focus();
    } else {
      console.log('Creating new window');
      variableEditorWindow = window.open(chrome.runtime.getURL('variableEditor.html'), 'variableEditor', 'width=400,height=600');
      if (!variableEditorWindow) {
        console.error('Failed to open variable editor window. Check if pop-ups are blocked.');
        alert('Failed to open variable editor. Please check if pop-ups are blocked for this site.');
        return;
      }
      variableEditorWindow.addEventListener('load', () => {
        console.log('Variable editor window loaded');
        extractAllRelevantCSSVariables().then(cssVariables => {
          console.log('Extracted CSS variables:', cssVariables);
          const allVariables = {...cssVariables.main, ...cssVariables.skin};
          console.log('Sending variables to editor:', allVariables);
          variableEditorWindow.postMessage({
            action: "updateVariableList",
            variables: allVariables
          }, '*');
        });
      });
    }
  }
  
  function updateVariable(variable) {
    console.log('Updating variable:', variable);
    const iframe = document.getElementById('storybook-preview-iframe');
    if (!iframe) {
      console.error('Storybook iframe not found');
      return;
    }
  
    try {
      const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
      const showcasedComponent = iframeDocument.querySelector('storybook-root > div > *');
      if (!showcasedComponent) {
        console.error('Showcased component not found');
        return;
      }
  
      for (const [key, value] of Object.entries(variable)) {
        showcasedComponent.style.setProperty(key, value);
      }
    } catch (e) {
      console.error('Error updating CSS variable:', e);
    }
  }
  
  console.log('Content script loaded');