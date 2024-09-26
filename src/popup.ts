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
        { action: "getVariables" },
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
        { action: "getVariables" },
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

function updateVariableList(variables: { [key: string]: string }) {
  console.log("Updating variable list", variables);
  const variableList = document.getElementById("variableList");
  if (variableList) {
    variableList.innerHTML = "";
    for (const [key, value] of Object.entries(variables)) {
      const listItem = document.createElement("li");
      listItem.textContent = `${key}: ${value}`;
      variableList.appendChild(listItem);
    }
  }
}

console.log("Popup script loaded");
