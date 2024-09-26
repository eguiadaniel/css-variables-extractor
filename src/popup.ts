export {};

let currentVariables: { [key: string]: string } = {};

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM fully loaded and parsed");
  loadAndDisplayVariables();

  const extractButton = document.getElementById("extract");
  const exportButton = document.getElementById("export");
  const importButton = document.getElementById("import");
  const importFileInput = document.getElementById(
    "importFile"
  ) as HTMLInputElement | null;

  if (extractButton) {
    extractButton.addEventListener("click", extractVariables);
    console.log("Extract button listener added");
  }

  if (exportButton) {
    exportButton.addEventListener("click", exportVariables);
    console.log("Export button listener added");
  }

  if (importButton && importFileInput) {
    importButton.addEventListener("click", () => {
      importFileInput.click();
    });
    console.log("Import button listener added");
  }

  if (importFileInput) {
    importFileInput.addEventListener("change", importVariables);
    console.log("Import file input listener added");
  }
});

function loadAndDisplayVariables() {
  console.log("Loading and displaying variables");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab?.id) {
      chrome.tabs.sendMessage(
        currentTab.id,
        { action: "getVariables" },
        (response) => {
          if (response?.variables) {
            currentVariables = response.variables;
            updateVariableList();
          }
        }
      );
    }
  });
}

function updateVariableList() {
  console.log("Updating variable list");
  const variableList = document.getElementById("variableList");
  if (!variableList) return;

  variableList.innerHTML = "";

  Object.entries(currentVariables).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "variable-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "variable-name";
    nameSpan.textContent = `${key}:`;
    row.appendChild(nameSpan);

    const input = document.createElement("input");
    input.type = isColorValue(value) ? "color" : "text";
    input.value = isColorValue(value) ? convertToHex(value) : value;
    input.dataset.varName = key;
    input.addEventListener(
      "input",
      isColorValue(value) ? handleColorChange : handleTextChange
    );
    row.appendChild(input);

    variableList.appendChild(row);
  });
}

function isColorValue(value: string): boolean {
  const colorRegex = /^(#[0-9A-Fa-f]{3,8}|(rgb|hsl)a?\(.*\))$/;
  return colorRegex.test(value.trim());
}

function convertToHex(color: string): string {
  const div = document.createElement("div");
  div.style.color = color;
  document.body.appendChild(div);
  const rgbColor = window.getComputedStyle(div).color;
  document.body.removeChild(div);

  const rgb = rgbColor.match(/\d+/g);
  return rgb
    ? "#" + rgb.map((x) => parseInt(x).toString(16).padStart(2, "0")).join("")
    : color;
}

function handleColorChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const varName = target.dataset.varName;
  const varValue = target.value;
  if (varName) {
    updateVariable(varName, varValue);
  }
}

function handleTextChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const varName = target.dataset.varName;
  const varValue = target.value;
  if (varName) {
    updateVariable(varName, varValue);
  }
}

function updateVariable(name: string, value: string) {
  currentVariables[name] = value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab?.id) {
      chrome.tabs.sendMessage(currentTab.id, {
        action: "updateVariable",
        variable: { [name]: value },
      });
    }
  });
}

function extractVariables() {
  console.log("Extracting variables");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab?.id) {
      chrome.tabs.sendMessage(
        currentTab.id,
        { action: "extract" },
        (response) => {
          if (response?.variables) {
            currentVariables = response.variables;
            updateVariableList();
            alert("CSS variables extracted successfully!");
          }
        }
      );
    }
  });
}

function exportVariables() {
  console.log("Exporting variables");
  const blob = new Blob([JSON.stringify(currentVariables, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: "css_variables.json",
  });
}

function importVariables(event: Event) {
  console.log("Importing variables");
  const fileInput = event.target as HTMLInputElement;
  const file = fileInput.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result === "string") {
          const importedVariables = JSON.parse(result);
          currentVariables = importedVariables;
          updateVariableList();
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab?.id) {
              chrome.tabs.sendMessage(currentTab.id, {
                action: "import",
                variables: importedVariables,
              });
            }
          });
          alert("CSS variables imported successfully!");
        }
      } catch (error) {
        console.error("Error parsing JSON:", error);
        alert("Error importing CSS variables. Please check the file format.");
      }
    };
    reader.readAsText(file);
  }
}

console.log("popup.ts loaded");
