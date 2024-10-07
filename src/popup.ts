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
  listItem.id = `var-${variable.name.slice(2)}`;

  const nameSpan = document.createElement("span");
  nameSpan.className = "variable-name";
  nameSpan.textContent = variable.name;
  listItem.appendChild(nameSpan);

  const valueContainer = document.createElement("div");
  valueContainer.className = "variable-value-container";

  const valueSpan = document.createElement("span");
  valueSpan.className = "variable-value";

  if (isColor(variable.resolvedValue)) {
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = variable.resolvedValue;
    valueSpan.appendChild(colorPicker);

    const colorText = document.createElement("input");
    colorText.type = "text";
    colorText.value = variable.alias ? variable.alias : variable.resolvedValue;
    colorText.className = "color-text";
    valueSpan.appendChild(colorText);

    // Event listener for color picker
    colorPicker.addEventListener("change", (event) => {
      const newColor = (event.target as HTMLInputElement).value;
      colorText.value = newColor;
      updateVariableValue(variable.name, newColor);
    });

    // Event listener for text input
    colorText.addEventListener("change", (event) => {
      const newColor = (event.target as HTMLInputElement).value;
      if (isColor(newColor)) {
        colorPicker.value = newColor;
        updateVariableValue(variable.name, newColor);
      }
    });
  } else {
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = variable.alias ? variable.alias : variable.resolvedValue;
    textInput.className = "text-input";
    valueSpan.appendChild(textInput);

    // Add event listener for text input
    textInput.addEventListener("input", (event) => {
      const newValue = (event.target as HTMLInputElement).value;
      updateVariableValue(variable.name, newValue);
    });
  }

  valueContainer.appendChild(valueSpan);

  const aliasContainer = document.createElement("div");
  aliasContainer.style.display = "flex";
  aliasContainer.style.flexDirection = "column";
  aliasContainer.style.flex = "0 0 auto";

  const aliasSpan = document.createElement("span");
  aliasSpan.className = "variable-alias";
  if (variable.alias) {
    aliasSpan.innerHTML = `Alias: <a href="#var-${variable.alias.slice(
      2
    )}" class="variable-link">${variable.alias}</a>`;
    aliasContainer.appendChild(aliasSpan);
  }

  const aliasOriginSpan = document.createElement("span");
  aliasOriginSpan.className = "variable-alias-origin";
  if (variable.aliasOrigin && variable.aliasOrigin !== variable.alias) {
    aliasOriginSpan.innerHTML = `Origin: <a href="#var-${variable.aliasOrigin.slice(
      2
    )}" class="variable-link">${variable.aliasOrigin}</a>`;
    aliasContainer.appendChild(aliasOriginSpan);
  }

  valueContainer.appendChild(aliasContainer);
  listItem.appendChild(valueContainer);

  return listItem;
}

function isColor(value: string): boolean {
  return /^(#|rgb|rgba|hsl|hsla)/.test(value);
}

function updateVariableValue(name: string, value: string) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
    if (activeTab.id) {
      chrome.tabs.sendMessage(
        activeTab.id,
        {
          action: "updateVariable",
          variable: { [name]: value },
        },
        function (response) {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else if (response && response.updatedVariables) {
            // Update the entire variable list with the new data
            updateSingleVariableInList(response.updatedVariable);
          }
        }
      );
    }
  });
}
function updateSingleVariableInList(updatedVariable: CSSVariable) {
  const variableElement = document.getElementById(
    `var-${updatedVariable.name.slice(2)}`
  );
  if (variableElement) {
    const valueSpan = variableElement.querySelector(".variable-value");
    if (valueSpan) {
      if (isColor(updatedVariable.resolvedValue)) {
        const colorPicker = valueSpan.querySelector(
          'input[type="color"]'
        ) as HTMLInputElement;
        const colorText = valueSpan.querySelector(
          ".color-text"
        ) as HTMLInputElement;
        if (colorPicker && colorText) {
          // Use the resolvedValue directly for both color picker and text input
          colorPicker.value = updatedVariable.resolvedValue;
          colorText.value = updatedVariable.resolvedValue;
        }
      } else {
        const textInput = valueSpan.querySelector(
          ".text-input"
        ) as HTMLInputElement;
        if (textInput) {
          textInput.value = updatedVariable.resolvedValue;
        }
      }
    }

    // Update alias and aliasOrigin if necessary
    const aliasSpan = variableElement.querySelector(".variable-alias");
    const aliasOriginSpan = variableElement.querySelector(
      ".variable-alias-origin"
    );
    if (aliasSpan) {
      aliasSpan.innerHTML = updatedVariable.alias
        ? `Alias: <a href="#var-${updatedVariable.alias.slice(
            2
          )}" class="variable-link">${updatedVariable.alias}</a>`
        : "";
    }
    if (aliasOriginSpan) {
      aliasOriginSpan.innerHTML =
        updatedVariable.aliasOrigin &&
        updatedVariable.aliasOrigin !== updatedVariable.alias
          ? `Origin: <a href="#var-${updatedVariable.aliasOrigin.slice(
              2
            )}" class="variable-link">${updatedVariable.aliasOrigin}</a>`
          : "";
    }
  }
}

console.log("Popup script loaded");
