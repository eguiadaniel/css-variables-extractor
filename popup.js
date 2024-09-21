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
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'variable-name';
    nameSpan.textContent = key + ':';
    row.appendChild(nameSpan);

    if (isColorValue(value)) {
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = convertToHex(value);
      colorInput.dataset.varName = key;
      colorInput.addEventListener('input', handleColorChange);
      row.appendChild(colorInput);
    } else {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = value;
      textInput.dataset.varName = key;
      textInput.addEventListener('input', handleTextChange);
      row.appendChild(textInput);
    }

    variableList.appendChild(row);
  }
}

function isColorValue(value) {
  // Check if the value is a valid color (hex, rgb, rgba, hsl, hsla)
  const colorRegex = /^(#[0-9A-Fa-f]{3,8}|(rgb|hsl)a?\(.*\))$/;
  return colorRegex.test(value.trim());
}

function convertToHex(color) {
  // Convert various color formats to hex
  const div = document.createElement('div');
  div.style.color = color;
  document.body.appendChild(div);
  const rgbColor = window.getComputedStyle(div).color;
  document.body.removeChild(div);
  
  const rgb = rgbColor.match(/\d+/g);
  return rgb ? "#" + rgb.map(x => parseInt(x).toString(16).padStart(2, '0')).join('') : color;
}

function handleColorChange(event) {
  const varName = event.target.dataset.varName;
  const varValue = event.target.value;
  updateVariable(varName, varValue);
}

function handleTextChange(event) {
  const varName = event.target.dataset.varName;
  const varValue = event.target.value;
  updateVariable(varName, varValue);
}

function updateVariable(name, value) {
  currentVariables[name] = value;
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