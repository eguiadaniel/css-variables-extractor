document.getElementById('extract').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: "extract"});
  });
});

document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(['cssVariables'], (result) => {
    if (result.cssVariables) {
      const blob = new Blob([JSON.stringify(result.cssVariables, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'css_variables.json'
      });
    } else {
      alert('No CSS variables found. Please extract variables first.');
    }
  });
});

document.getElementById('import').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const cssVariables = JSON.parse(e.target.result);
        chrome.storage.local.set({cssVariables}, () => {
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "import", variables: cssVariables});
          });
        });
      } catch (error) {
        console.error('Error parsing JSON:', error);
        alert('Error importing CSS variables. Please check the file format.');
      }
    };
    reader.readAsText(file);
  }
});

document.getElementById('updateVariables').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: "openVariableEditor"});
    });
  });