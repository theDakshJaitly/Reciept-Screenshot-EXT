// options.js

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

// UPDATED: saveSettings function now includes the spreadsheetId
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
        fileNameFormat: elements.fileNameFormatInput.value || 'receipt_{date}_{time}',
        spreadsheetId: elements.spreadsheetIdInput.value.trim() // NEW: Save spreadsheet ID
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
    // UPDATED: Cache DOM elements
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
        statusElement: document.getElementById('status'),
        connectButton: document.getElementById('connect-google'), // NEW
        authStatus: document.getElementById('auth-status'), // NEW
        spreadsheetIdInput: document.getElementById('spreadsheet-id') // NEW
    };

    // Add event listeners
    elements.saveSettingsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        saveSettings();
    });

    // Add event listeners for all inputs to detect changes
    function addChangeListeners() {
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', showUnsavedChanges);
        });
    }

    // --- NEW: Google Auth Logic ---
    function getAuthToken() {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          elements.authStatus.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        if (token) {
          elements.authStatus.textContent = 'Status: Connected!';
          elements.authStatus.style.color = 'green';
          elements.connectButton.textContent = 'Connected';
          elements.connectButton.disabled = true;
          console.log('Got auth token:', token);
        }
      });
    }
    
    elements.connectButton.addEventListener('click', getAuthToken);
    // -------------------------
     
    // Default detection keywords (preserved from your code)
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
    
    // Function to load settings
    function loadSettings() {
      // UPDATED: chrome.storage.sync.get call
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
        fileNameFormat: 'receipt_{date}_{time}',
        spreadsheetId: '' // NEW: Load spreadsheet ID
      }, function(items) {
        // Set form values
        elements.autoDetectToggle.checked = items.autoDetect;
        elements.showNotificationsToggle.checked = items.showNotifications;
        elements.detectionThreshold.value = items.detectionThreshold;
        elements.screenshotDelayToggle.checked = items.screenshotDelay;
        elements.delayTimeInput.value = items.delayTime;
        elements.cropScreenshotToggle.checked = items.cropScreenshot;
        elements.fileNameFormatInput.value = items.fileNameFormat;
        elements.spreadsheetIdInput.value = items.spreadsheetId; // NEW: Set spreadsheet ID input
        
        // Render keywords
        renderKeywords('strong', items.strongKeywords);
        renderKeywords('supporting', items.supportingKeywords);

        // Update sensitivity description
        updateSensitivityDescription(items.detectionThreshold);

        // NEW: Check initial auth status on load
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (token) {
                elements.authStatus.textContent = 'Status: Connected!';
                elements.authStatus.style.color = 'green';
                elements.connectButton.textContent = 'Connected';
                elements.connectButton.disabled = true;
            }
        });
      });

      addChangeListeners();
    }
    
    // Call loadSettings to initialize the page
    loadSettings();
    
    // Event listeners (preserved from your code)
    elements.addStrongKeywordBtn.addEventListener('click', () => addKeyword('strong'));
    elements.addSupportingKeywordBtn.addEventListener('click', () => addKeyword('supporting'));
    
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

    function renderKeywords(type, keywords) {
      const container = type === 'strong' ? elements.strongKeywordsContainer : elements.supportingKeywordsContainer;
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
    
    function addKeyword(type) {
      const input = type === 'strong' ? elements.newStrongKeywordInput : elements.newSupportingKeywordInput;
      const keyword = input.value.trim();
      
      if (!keyword) return;
      
      const container = type === 'strong' ? elements.strongKeywordsContainer : elements.supportingKeywordsContainer;
      // ... (rest of your addKeyword logic is fine)
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
    
    function removeKeyword(type, element) {
      const container = type === 'strong' ? elements.strongKeywordsContainer : elements.supportingKeywordsContainer;
      container.removeChild(element);
      showUnsavedChanges();
    }

    // Add validation for the file name format (preserved from your code)
    elements.fileNameFormatInput.addEventListener('input', function(e) {
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