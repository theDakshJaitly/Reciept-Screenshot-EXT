// content.js

let autoDetectEnabled = true;
let settings = {};
let hasScreenshotTaken = false;

// Load settings from storage
chrome.storage.sync.get({
  autoDetect: true,
  showNotifications: true,
  // ... other defaults
}, function(items) {
  autoDetectEnabled = items.autoDetect;
  settings = items;
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;
  } else if (message.action === 'manualCapture') {
    captureReceipt().then(success => sendResponse({success})).catch(err => sendResponse({success: false, error: err.message}));
    return true; // Keep message channel open for async response
  }
});

// ==================== NEW HYBRID DETECTION LOGIC ====================

function findMerchantName() {
    // Strategy 1: Look for a prominent H1 tag
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.trim().length > 2) return h1.innerText.trim();

    // Strategy 2: Look for a logo with alt text
    const logo = document.querySelector('img[alt*="logo"], img[src*="logo"]');
    if (logo && logo.alt) return logo.alt.replace('logo', '').trim();

    // Strategy 3: Use the website's title
    if (document.title) return document.title.split('|')[0].split('-')[0].trim();
    
    return "Unknown Merchant";
}

function findReceiptContainer() {
    const textNodes = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while(node = walk.nextNode()) {
        if (node.parentElement && node.parentElement.offsetParent !== null && node.nodeValue.trim().length > 1) {
            textNodes.push(node);
        }
    }

    let totalNode = null;
    for (const node of textNodes.slice().reverse()) {
        const text = node.nodeValue.toLowerCase();
        if ((text.includes('total') || text.includes('amount')) && !text.includes('sub') && text.match(/\d/)) {
            totalNode = node.parentElement;
            break;
        }
    }
    
    if (totalNode) {
        let parent = totalNode;
        // Go up the DOM tree to find a container that isn't tiny
        while (parent && parent.getBoundingClientRect().height < 100 && parent.parentElement) {
            parent = parent.parentElement;
        }
        if (parent && parent !== document.body) {
            return parent;
        }
    }

    console.log("Could not find a reliable receipt container.");
    return null;
}

// ==================== UI & SCREENSHOT LOGIC ====================

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `receipt-extension-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function captureReceipt() {
  try {
    const receiptElement = findReceiptContainer();
    
    if (!receiptElement) {
      if (settings.showNotifications) showToast('No receipt found.', 'error');
      return false;
    }
    
    // This is the key part of our new strategy:
    const merchantName = findMerchantName();

    receiptElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 500));

    const canvas = await html2canvas(receiptElement, { scale: 2, useCORS: true });
    const imageData = canvas.toDataURL('image/png', 1.0);

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
          action: 'processReceipt', 
          imageData: imageData,
          merchantName: merchantName // Pass the separately found merchant name
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          if (settings.showNotifications) showToast('Receipt logged to Google Sheets!', 'success');
          resolve(true);
        } else {
          reject(new Error(response ? response.error : 'Failed to process receipt'));
        }
      });
    });
  } catch (error) {
    console.error('Error capturing receipt:', error);
    if (settings.showNotifications) showToast('Capture Error: ' + error.message, 'error');
    return false;
  }
}

// ==================== DYNAMIC DETECTION & INITIAL LOAD ====================

window.addEventListener('load', () => {
  setTimeout(() => {
    if (!hasScreenshotTaken && autoDetectEnabled && findReceiptContainer()) {
      console.log('Receipt container found on page load!');
      hasScreenshotTaken = true;
      captureReceipt();
    }
  }, 2000);
});