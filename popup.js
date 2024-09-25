let currentVariables = {};

document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractButton');
  const exportButton = document.getElementById('exportButton');
  const importInput = document.getElementById('importInput');
  const statusDiv = document.getElementById('status');

  extractButton.addEventListener('click', extractVariables);
  exportButton.addEventListener('click', exportVariables);
  importInput.addEventListener('change', importVariables);
});

function extractVariables() {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Extracting variables...';
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "extract"}, function(response) {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
      } else if (response.error) {
        statusDiv.textContent = 'Error: ' + response.error;
      } else {
        statusDiv.textContent = 'Variables extracted successfully!';
        currentVariables = response.variables;
        updateVariableList();
      }
    });
  });
}

function updateVariableList() {
  const variableList = document.getElementById('variableList');
  variableList.innerHTML = '';

  for (const source in currentVariables) {
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'source-section';
    sourceDiv.innerHTML = `<h3>${source}</h3>`;

    for (const variable of currentVariables[source].variables) {
      const row = document.createElement('div');
      row.className = 'variable-row';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'variable-name';
      nameSpan.textContent = variable.name + ':';
      row.appendChild(nameSpan);

      if (isColorValue(variable.value)) {
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = convertToHex(variable.value);
        colorInput.dataset.varId = variable.id;
        colorInput.addEventListener('input', handleColorChange);
        row.appendChild(colorInput);
      } else {
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.value = variable.value;
        textInput.dataset.varId = variable.id;
        textInput.addEventListener('input', handleTextChange);
        row.appendChild(textInput);
      }

      sourceDiv.appendChild(row);
    }

    variableList.appendChild(sourceDiv);
  }
}

function isColorValue(value) {
  const colorRegex = /^(#[0-9A-Fa-f]{3,8}|(rgb|hsl)a?\(.*\))$/;
  return colorRegex.test(value.trim());
}

function convertToHex(color) {
  const div = document.createElement('div');
  div.style.color = color;
  document.body.appendChild(div);
  const rgbColor = window.getComputedStyle(div).color;
  document.body.removeChild(div);
  
  const rgb = rgbColor.match(/\d+/g);
  return rgb ? "#" + rgb.map(x => parseInt(x).toString(16).padStart(2, '0')).join('') : color;
}

function handleColorChange(event) {
  const varId = event.target.dataset.varId;
  const varValue = event.target.value;
  updateVariable(varId, varValue);
}

function handleTextChange(event) {
  const varId = event.target.dataset.varId;
  const varValue = event.target.value;
  updateVariable(varId, varValue);
}

function updateVariable(id, value) {
  for (const source in currentVariables) {
    const index = currentVariables[source].variables.findIndex(v => v.id === id);
    if (index !== -1) {
      currentVariables[source].variables[index].value = value;
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateVariable",
          variable: currentVariables[source].variables[index]
        });
      });
      break;
    }
  }
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