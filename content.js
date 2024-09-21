// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract") {
      extractAllCSSVariables()
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
      applyCSSVariablesToIframe(request.variables);
      alert('CSS variables applied successfully!');
    }
  });
  
  async function extractAllCSSVariables() {
    const iframe = document.getElementById('storybook-preview-iframe');
    if (!iframe) {
      console.error('Storybook iframe not found');
      return {};
    }
  
    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
  
    const mainStylesheet = iframeDocument.querySelector('link[href="main.css"]');
    const skinStylesheet = iframeDocument.querySelector('link#skin-stylesheet');
  
    if (!mainStylesheet || !skinStylesheet) {
      console.error('One or both stylesheets not found');
      return {};
    }
  
    const mainVariables = await extractCSSVariablesFromStylesheet(mainStylesheet.href);
    const skinVariables = await extractCSSVariablesFromStylesheet(skinStylesheet.href);
  
    return {
      main: mainVariables,
      skin: skinVariables
    };
  }
  
  async function extractCSSVariablesFromStylesheet(stylesheetUrl) {
    try {
      const response = await fetch(stylesheetUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const cssText = await response.text();
      return extractCSSVariablesFromText(cssText);
    } catch (error) {
      console.error(`Error fetching stylesheet ${stylesheetUrl}:`, error);
      return {};
    }
  }
  
  function extractCSSVariablesFromText(cssText) {
    const variables = {};
    const regex = /(--.+?):\s*(.+?);/g;
    let match;
  
    while ((match = regex.exec(cssText)) !== null) {
      variables[match[1]] = match[2];
    }
  
    return variables;
  }
  
  function applyCSSVariablesToIframe(variables) {
    const iframe = document.getElementById('storybook-preview-iframe');
    if (!iframe) {
      console.error('Storybook iframe not found');
      return;
    }
  
    try {
      const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
      const root = iframeDocument.documentElement;
      for (const section in variables) {
        for (const [key, value] of Object.entries(variables[section])) {
          root.style.setProperty(key, value);
        }
      }
    } catch (e) {
      console.error('Error applying CSS variables to iframe', e);
    }
  }