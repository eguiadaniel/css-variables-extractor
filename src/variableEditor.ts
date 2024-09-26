export {};

interface VariableData {
  action: string;
  variables: { [key: string]: string };
}

let currentVariables: { [key: string]: string } = {};

window.addEventListener(
  "message",
  function (event: MessageEvent<VariableData>) {
    console.log("Message received in variableEditor:", event.data);
    if (event.data.action === "updateVariableList") {
      currentVariables = event.data.variables;
      updateVariableList();
    }
  }
);

function updateVariableList(): void {
  console.log("Updating variable list with:", currentVariables);
  const variableList = document.getElementById("variableList");
  if (!variableList) return;

  variableList.innerHTML = "";

  Object.entries(currentVariables).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "variable-row";
    row.innerHTML = `
      <span class="variable-name">${key}:</span>
      <input type="text" value="${value}" data-var-name="${key}">
    `;
    variableList.appendChild(row);
  });

  // Add event listeners to inputs
  const inputs = variableList.querySelectorAll("input");
  inputs.forEach((input) => {
    input.addEventListener("input", function (this: HTMLInputElement) {
      const varName = this.dataset.varName;
      const varValue = this.value;
      if (varName) {
        currentVariables[varName] = varValue;
        console.log("Sending update for variable:", varName, varValue);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const currentTab = tabs[0];
          if (currentTab?.id) {
            chrome.tabs.sendMessage(currentTab.id, {
              action: "updateVariable",
              variable: { [varName]: varValue },
            });
          }
        });
      }
    });
  });
}

console.log("variableEditor.ts loaded");
