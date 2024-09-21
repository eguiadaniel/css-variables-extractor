// popup.js
let currentVariables = {};

document.addEventListener('DOMContentLoaded', function() {
  loadAndDisplayVariables();

  document.getElementById('extract').addEventListener('click', extractVariables);
  document.getElementById('export').addEventListener('click', exportVariables);
  document.getElementById('import').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importVariables);
});

function loadAndDisplayVariables() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: "getVariables"}, (response) => {
      if (response && response.variables) {
        currentVariables = response.variables;
        updateVariableList();
      }
    });
  });
}

function updateVariableList() {
  const variableList = document.getElementById('variableList');
  variableList.innerHTML = '';

  for (const [key, value] of Object.entries(currentVariables)) {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.innerHTML = `
      <span class="variable-name">${key}:</span>
      <input type="text" value="${value}" data-var-name="${key}">
    `;
    variableList.appendChild(row);
  }

  // Add event listeners to inputs
  const inputs = variableList.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', function() {
      const varName = this.dataset.varName;
      const varValue = this.value;
      currentVariables[varName] = varValue;
      updateVariable(varName, varValue);
    });
  });
}

function updateVariable(name, value) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "updateVariable",
      variable: { [name]: value }
    });
  });
}

function extractVariables() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: "extract"}, (response) => {
      if (response && response.variables) {
        currentVariables = response.variables;
        updateVariableList();
        alert('CSS variables extracted successfully!');
      }
    });
  });
}

function exportVariables() {
  const blob = new Blob([JSON.stringify(currentVariables, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: 'css_variables.json'
  });
}

function importVariables(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedVariables = JSON.parse(e.target.result);
        currentVariables = importedVariables;
        updateVariableList();
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "import",
            variables: importedVariables
          });
        });
        alert('CSS variables imported successfully!');
      } catch (error) {
        console.error('Error parsing JSON:', error);
        alert('Error importing CSS variables. Please check the file format.');
      }
    };
    reader.readAsText(file);
  }
}