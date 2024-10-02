document.addEventListener("DOMContentLoaded", function () {
  console.log("Popup DOM fully loaded and parsed");

  const extractButton = document.getElementById("extract");
  const exportButton = document.getElementById("export");
  const importButton = document.getElementById("import");
  const importFileInput = document.getElementById(
    "importFile"
  ) as HTMLInputElement;

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

  // Load and display initial variables
  loadAndDisplayVariables();
});

function extractVariables() {
  console.log("Extracting variables");
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
    if (activeTab.id) {
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: "extract" },
        function (response) {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else if (response && response.variables) {
            updateVariableList(response.variables);
          }
        }
      );
    }
  });
}

function exportVariables() {
  console.log("Exporting variables");
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
    if (activeTab.id) {
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: "exportVariables" },
        function (response) {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else if (response && response.variables) {
            const blob = new Blob(
              [JSON.stringify(response.variables, null, 2)],
              { type: "application/json" }
            );
            const url = URL.createObjectURL(blob);
            chrome.downloads.download({
              url: url,
              filename: "css_variables.json",
            });
          }
        }
      );
    }
  });
}

function importVariables(event: Event) {
  console.log("Importing variables");
  const fileInput = event.target as HTMLInputElement;
  const file = fileInput.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const content = e.target?.result;
      if (typeof content === "string") {
        try {
          const variables = JSON.parse(content);
          chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
              const activeTab = tabs[0];
              if (activeTab.id) {
                chrome.tabs.sendMessage(
                  activeTab.id,
                  { action: "import", variables: variables },
                  function (response) {
                    if (chrome.runtime.lastError) {
                      console.error(chrome.runtime.lastError);
                    } else if (response && response.success) {
                      updateVariableList(variables);
                    }
                  }
                );
              }
            }
          );
        } catch (error) {
          console.error("Error parsing imported JSON:", error);
        }
      }
    };
    reader.readAsText(file);
  }
}

function loadAndDisplayVariables() {
  console.log("Loading and displaying variables");
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
    if (activeTab.id) {
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: "exportVariables" },
        function (response) {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else if (response && response.variables) {
            updateVariableList(response.variables);
          }
        }
      );
    }
  });
}
function updateVariableList(variables: CSSVariable[]) {
  console.log("Updating variable list", variables);
  const variableList = document.getElementById("variableList");
  if (variableList) {
    variableList.innerHTML = "";

    const categories = [
      {
        name: "Variables in Current Story",
        filter: (v: CSSVariable) => v.inCurrentStory,
      },
      {
        name: "Variables with Origin: main",
        filter: (v: CSSVariable) => v.origin === "main",
      },
      {
        name: "Variables with Origin: skin",
        filter: (v: CSSVariable) => v.origin === "skin",
      },
    ];

    const variableMap = new Map(variables.map((v) => [v.name, v]));

    categories.forEach((category) => {
      const categoryDiv = document.createElement("div");
      categoryDiv.className = "variable-category";
      categoryDiv.innerHTML = `<h3>${category.name}</h3>`;

      const filteredVariables = variables.filter(category.filter);

      filteredVariables.forEach((variable) => {
        const listItem = createVariableListItem(variable, variableMap);
        categoryDiv.appendChild(listItem);
      });

      variableList.appendChild(categoryDiv);
    });

    // Add click event listeners to variable links
    document.querySelectorAll(".variable-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const targetId = (event.currentTarget as HTMLAnchorElement)
          .getAttribute("href")
          ?.slice(1);
        if (targetId) {
          const targetElement = document.getElementById(targetId);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth" });
            targetElement.classList.add("highlight");
            setTimeout(() => targetElement.classList.remove("highlight"), 2000);
          }
        }
      });
    });
  }
}

function createVariableListItem(
  variable: CSSVariable,
  variableMap: Map<string, CSSVariable>
): HTMLLIElement {
  const listItem = document.createElement("li");
  listItem.className = "variable-item";
  listItem.id = `var-${variable.name.slice(2)}`; // Remove leading '--' for the id

  const nameSpan = document.createElement("span");
  nameSpan.className = "variable-name";
  nameSpan.textContent = variable.name;

  const valueSpan = document.createElement("span");
  valueSpan.className = "variable-value";

  if (isColor(variable.value)) {
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = variable.value;
    colorPicker.disabled = true;
    valueSpan.appendChild(colorPicker);
  }

  const valueText = document.createElement("span");
  valueText.innerHTML = createLinkedValue(variable.value, variableMap);
  valueSpan.appendChild(valueText);

  listItem.appendChild(nameSpan);
  listItem.appendChild(valueSpan);

  return listItem;
}

function createLinkedValue(
  value: string,
  variableMap: Map<string, CSSVariable>
): string {
  return value.replace(/var\((--[\w-]+)\)/g, (match, varName) => {
    if (variableMap.has(varName)) {
      return `<a href="#var-${varName.slice(
        2
      )}" class="variable-link">${match}</a>`;
    }
    return match;
  });
}

function isColor(value: string): boolean {
  // Simple check for hex colors, rgb, rgba, hsl, hsla
  return /^(#|rgb|hsl)/.test(value);
}

console.log("Popup script loaded");
