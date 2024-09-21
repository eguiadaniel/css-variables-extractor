// variableEditor.js
let currentVariables = {};

window.addEventListener('message', function(event) {
  console.log('Message received in variableEditor:', event.data);
  if (event.data.action === "updateVariableList") {
    currentVariables = event.data.variables;
    updateVariableList();
  }
});

function updateVariableList() {
  console.log('Updating variable list with:', currentVariables);
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
      chrome.runtime.sendMessage({
        action: "updateVariable",
        variable: { [varName]: varValue }
      });
    });
  });
}

console.log('variableEditor.js loaded');