// Global variables
let hasUnsavedChanges = false;
let elements = {};

// Move message handlers outside DOMContentLoaded
function showSavedMessage() {
    const statusElement = document.getElementById('status');
    const saveWarning = document.getElementById('saveWarning');
    const saveButton = document.getElementById('saveSettings');
    
    if (!statusElement) return;
    
    hasUnsavedChanges = false;
    if (saveWarning) saveWarning.classList.remove('show');
    if (saveButton) saveButton.classList.remove('show-save');
    
    statusElement.textContent = 'Settings saved successfully!';
    statusElement.style.backgroundColor = '#e8f5e9';
    statusElement.style.color = '#2e7d32';
    statusElement.classList.add('show');
    
    setTimeout(() => {
        statusElement.classList.remove('show');
    }, 2000);
}

function showUnsavedChanges() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        document.getElementById('saveWarning').classList.add('show');
        document.getElementById('saveSettings').classList.add('show-save');
    }
}

// Save settings function outside DOMContentLoaded
function saveSettings() {
    const strongKeywords = [];
    document.querySelectorAll('#strongKeywords .keyword').forEach(element => {
        strongKeywords.push(element.dataset.keyword);
    });
    
    const supportingKeywords = [];
    document.querySelectorAll('#supportingKeywords .keyword').forEach(element => {
        supportingKeywords.push(element.dataset.keyword);
    });
    
    const settings = {
        autoDetect: elements.autoDetectToggle.checked,
        showNotifications: elements.showNotificationsToggle.checked,
        detectionThreshold: parseInt(elements.detectionThreshold.value),
        strongKeywords: strongKeywords,
        supportingKeywords: supportingKeywords,
        screenshotDelay: elements.screenshotDelayToggle.checked,
        delayTime: parseInt(elements.delayTimeInput.value),
        cropScreenshot: elements.cropScreenshotToggle.checked,
        fileNameFormat: elements.fileNameFormatInput.value || 'receipt_{date}_{time}'
    };

    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving settings:', chrome.runtime.lastError);
            return;
        }

        showSavedMessage();
        
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                try {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'settingsUpdated',
                        settings: settings
                    });
                } catch (error) {
                    console.log('Could not update tab:', tab.id, error);
                }
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Cache DOM elements
    elements = {
        autoDetectToggle: document.getElementById('autoDetect'),
        showNotificationsToggle: document.getElementById('showNotifications'),
        detectionThreshold: document.getElementById('detectionThreshold'),
        strongKeywordsContainer: document.getElementById('strongKeywords'),
        supportingKeywordsContainer: document.getElementById('supportingKeywords'),
        newStrongKeywordInput: document.getElementById('newStrongKeyword'),
        addStrongKeywordBtn: document.getElementById('addStrongKeyword'),
        newSupportingKeywordInput: document.getElementById('newSupportingKeyword'),
        addSupportingKeywordBtn: document.getElementById('addSupportingKeyword'),
        screenshotDelayToggle: document.getElementById('screenshotDelay'),
        delayTimeInput: document.getElementById('delayTime'),
        saveSettingsBtn: document.getElementById('saveSettings'),
        cropScreenshotToggle: document.getElementById('cropScreenshot'),
        fileNameFormatInput: document.getElementById('fileNameFormat'),
        statusElement: document.getElementById('status')
    };

    // Add event listeners
    elements.saveSettingsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        saveSettings();
    });

    // Function to show unsaved changes warning
    function showUnsavedChanges() {
        if (!hasUnsavedChanges) {
            hasUnsavedChanges = true;
            document.getElementById('saveWarning').classList.add('show');
            document.getElementById('saveSettings').classList.add('show-save');
        }
    }

    // Add event listeners for all inputs to detect changes
    function addChangeListeners() {
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', showUnsavedChanges);
        });
    }

    // Get form elements
    const autoDetectToggle = document.getElementById('autoDetect');
    const showNotificationsToggle = document.getElementById('showNotifications');
    const detectionThreshold = document.getElementById('detectionThreshold');
    const strongKeywordsContainer = document.getElementById('strongKeywords');
    const supportingKeywordsContainer = document.getElementById('supportingKeywords');
    const newStrongKeywordInput = document.getElementById('newStrongKeyword');
    const addStrongKeywordBtn = document.getElementById('addStrongKeyword');
    const newSupportingKeywordInput = document.getElementById('newSupportingKeyword');
    const addSupportingKeywordBtn = document.getElementById('addSupportingKeyword');
    const screenshotDelayToggle = document.getElementById('screenshotDelay');
    const delayTimeInput = document.getElementById('delayTime');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const statusElement = document.getElementById('status');
    const cropScreenshotToggle = document.getElementById('cropScreenshot');
    const fileNameFormatInput = document.getElementById('fileNameFormat');
    
    // Default detection keywords
    const defaultStrongKeywords = [
      'receipt', 'invoice', 'order confirmation', 'payment confirmation',
      'tax invoice', 'billing statement', 'purchase receipt'
    ];
    
    const defaultSupportingKeywords = [
      'subtotal', 'total', 'amount paid', 'order summary', 'tax', 
      'purchase', 'payment method', 'billing', 'order number',
      'transaction', 'date of purchase', 'merchant', 'item', 'quantity',
      'unit price', 'discount', 'payment', 'due date', 'account number'
    ];
    
    // Load saved settings
    loadSettings();
    
    // Event listeners
    addStrongKeywordBtn.addEventListener('click', () => addKeyword('strong'));
    addSupportingKeywordBtn.addEventListener('click', () => addKeyword('supporting'));
    saveSettingsBtn.addEventListener('click', function(e) {
      e.preventDefault();
      saveSettings();
    });
    
    // Function to load settings
    function loadSettings() {
      chrome.storage.sync.get({
        // Default values
        autoDetect: true,
        showNotifications: true,
        detectionThreshold: 7,
        strongKeywords: defaultStrongKeywords,
        supportingKeywords: defaultSupportingKeywords,
        screenshotDelay: true,
        delayTime: 500,
        cropScreenshot: true,
        fileNameFormat: 'receipt_{date}_{time}'
      }, function(items) {
        // Set form values
        autoDetectToggle.checked = items.autoDetect;
        showNotificationsToggle.checked = items.showNotifications;
        detectionThreshold.value = items.detectionThreshold;
        screenshotDelayToggle.checked = items.screenshotDelay;
        delayTimeInput.value = items.delayTime;
        cropScreenshotToggle.checked = items.cropScreenshot;
        fileNameFormatInput.value = items.fileNameFormat;
        
        // Render keywords
        renderKeywords('strong', items.strongKeywords);
        renderKeywords('supporting', items.supportingKeywords);

        // Update sensitivity description
        updateSensitivityDescription(items.detectionThreshold);
      });

      // Add to the end of loadSettings function
      addChangeListeners();
    }
    
    // Add new function to update sensitivity description
    function updateSensitivityDescription(threshold) {
      const description = document.getElementById('sensitivityDescription');
      if (description) {
        const descriptions = {
          5: 'Very high (may have false positives)',
          7: 'High (recommended)',
          9: 'Medium (fewer false positives)',
          11: 'Low (strict detection)'
        };
        description.textContent = descriptions[threshold] || descriptions[7];
      }
    }

    // Function to save settings
    function saveSettings() {
      // Get current strong keywords
      const strongKeywords = [];
      document.querySelectorAll('#strongKeywords .keyword').forEach(element => {
        strongKeywords.push(element.dataset.keyword);
      });
      
      // Get current supporting keywords
      const supportingKeywords = [];
      document.querySelectorAll('#supportingKeywords .keyword').forEach(element => {
        supportingKeywords.push(element.dataset.keyword);
      });
      
      // Save all settings
      const settings = {
        autoDetect: autoDetectToggle.checked,
        showNotifications: showNotificationsToggle.checked,
        detectionThreshold: parseInt(detectionThreshold.value),
        strongKeywords: strongKeywords,
        supportingKeywords: supportingKeywords,
        screenshotDelay: screenshotDelayToggle.checked,
        delayTime: parseInt(delayTimeInput.value),
        cropScreenshot: cropScreenshotToggle.checked,
        fileNameFormat: fileNameFormatInput.value || 'receipt_{date}_{time}'
      };

      // Save to storage and notify content script
      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving settings:', chrome.runtime.lastError);
          return;
        }

        // Show saved message
        showSavedMessage();
        
        // Notify all tabs about the settings change
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            try {
              chrome.tabs.sendMessage(tab.id, {
                action: 'settingsUpdated',
                settings: settings
              });
            } catch (error) {
              console.log('Could not update tab:', tab.id, error);
            }
          });
        });
      });
    }
    
    // Function to render keywords
    function renderKeywords(type, keywords) {
      const container = type === 'strong' ? strongKeywordsContainer : supportingKeywordsContainer;
      container.innerHTML = '';
      
      keywords.forEach(keyword => {
        const keywordElement = document.createElement('div');
        keywordElement.className = 'keyword';
        keywordElement.dataset.keyword = keyword;
        
        const keywordSpan = document.createElement('span');
        keywordSpan.textContent = keyword;
        
        const removeButton = document.createElement('button');
        removeButton.setAttribute('aria-label', 'Remove keyword');
        removeButton.title = 'Remove';
        removeButton.addEventListener('click', () => removeKeyword(type, keywordElement));
        
        keywordElement.appendChild(keywordSpan);
        keywordElement.appendChild(removeButton);
        container.appendChild(keywordElement);
      });
    }
    
    // Function to add new keyword
    function addKeyword(type) {
      const input = type === 'strong' ? newStrongKeywordInput : newSupportingKeywordInput;
      const keyword = input.value.trim();
      
      if (!keyword) {
        return;
      }
      
      // Create new keyword element
      const container = type === 'strong' ? strongKeywordsContainer : supportingKeywordsContainer;
      const keywordElement = document.createElement('div');
      keywordElement.className = 'keyword';
      keywordElement.dataset.keyword = keyword;
      
      const keywordSpan = document.createElement('span');
      keywordSpan.textContent = keyword;
      
      const removeButton = document.createElement('button');
      removeButton.setAttribute('aria-label', 'Remove keyword');
      removeButton.title = 'Remove';
      removeButton.addEventListener('click', () => removeKeyword(type, keywordElement));
      
      keywordElement.appendChild(keywordSpan);
      keywordElement.appendChild(removeButton);
      container.appendChild(keywordElement);
      input.value = '';
      showUnsavedChanges();
    }
    
    // Function to remove keyword
    function removeKeyword(type, element) {
      const container = type === 'strong' ? strongKeywordsContainer : supportingKeywordsContainer;
      container.removeChild(element);
      showUnsavedChanges();
    }
    
    // Function to choose save folder
    function chooseSaveFolder() {
      // Chrome doesn't provide a direct way to select folders via JavaScript
      // Instead, we'll use the downloads API to trigger a file picker
      chrome.downloads.showDefaultFolder();
      
      // Show a message to the user
      statusElement.textContent = 'Please select a folder in the opened window';
      
      // Since we can't directly access the folder selection dialog,
      // we'll provide a way for users to manually enter the folder path
      const folderPath = prompt('Enter the folder path where you want to save screenshots:');
      
      if (folderPath) {
        saveFolderInput.value = folderPath;
        statusElement.textContent = 'Save location updated';
      }
    }

    // Add validation for the file name format
    document.getElementById('fileNameFormat').addEventListener('input', function(e) {
      const value = e.target.value;
      const isValid = value.includes('{date}') || value.includes('{time}') || value.includes('{website}');
      
      if (!isValid && value.length > 0) {
        e.target.setCustomValidity('Must include at least one of: {date}, {time}, or {website}');
      } else {
        e.target.setCustomValidity('');
      }
      
      showUnsavedChanges();
    });
  });