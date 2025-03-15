// Move this function outside the DOMContentLoaded event listener
function showSavedMessage() {
    const statusElement = document.getElementById('status');
    const saveWarning = document.getElementById('saveWarning');
    const saveButton = document.getElementById('saveSettings');
    
    if (!statusElement) return;
    
    hasUnsavedChanges = false;
    saveWarning.classList.remove('show');
    saveButton.classList.remove('show-save');
    
    statusElement.textContent = 'Settings saved successfully!';
    statusElement.style.backgroundColor = '#e8f5e9';
    statusElement.style.color = '#2e7d32';
    statusElement.classList.add('show');
    
    setTimeout(() => {
        statusElement.classList.remove('show');
    }, 2000);
}

document.addEventListener('DOMContentLoaded', function() {
    // Add at the beginning of the DOMContentLoaded event listener
    let hasUnsavedChanges = false;

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
    saveSettingsBtn.addEventListener('click', saveSettings);
    
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

      chrome.storage.sync.set(settings, function() {
        showSavedMessage(); // This should now work
        
        // Notify content script of settings change
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'settingsUpdated',
              settings: settings
            });
          }
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
  });