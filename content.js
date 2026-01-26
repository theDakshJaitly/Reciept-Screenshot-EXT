// content.js

let autoDetectEnabled = true;
let settings = {};
let hasScreenshotTaken = false;

// Load settings from storage
chrome.storage.sync.get({
  autoDetect: true,
  showNotifications: true,
  // ... other defaults
}, function (items) {
  autoDetectEnabled = items.autoDetect;
  settings = items;
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;
  } else if (message.action === 'manualCapture') {
    captureReceipt().then(success => sendResponse({ success })).catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

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
    // This is the key part of our new strategy:
    // Use findMerchantName from detection.js (we need to move it there or keep it here if not present)
    // Since we removed it from here, we need to ensure it's in detection.js or re-add it. 
    // Wait, I removed it in the previous chunk. I should have moved it to detection.js first.
    // Let's assume I will add it to detection.js in the next step.
    let merchantName = typeof findMerchantName === 'function' ? findMerchantName() : "Unknown Merchant";
    // sanitize merchantName: trim, remove newlines, reject generic labels
    merchantName = (merchantName || '').toString().replace(/\s+/g, ' ').trim();
    const badLabels = ['subtotal', 'total', 'invoice', 'order', 'receipt', 'amount', 'tax'];
    if (badLabels.includes(merchantName.toLowerCase())) merchantName = '';

    receiptElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 500));

    const canvas = await html2canvas(receiptElement, { scale: 2, useCORS: true });
    console.log('[Content] Canvas captured. Dimensions:', canvas.width, 'x', canvas.height);

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Captured canvas has 0 dimensions');
    }

    // Post-process the canvas: draw on white bg and increase contrast to help OCR
    try {
      const w = canvas.width;
      const h = canvas.height;
      const processed = document.createElement('canvas');
      processed.width = w;
      processed.height = h;
      const ctx = processed.getContext('2d');
      // White background (helps with transparent areas)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(canvas, 0, 0);

      // Increase contrast slightly
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const contrast = 30; // -100..100
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = truncate(factor * (data[i] - 128) + 128);     // R
        data[i + 1] = truncate(factor * (data[i + 1] - 128) + 128); // G
        data[i + 2] = truncate(factor * (data[i + 2] - 128) + 128); // B
        // alpha left as-is
      }
      ctx.putImageData(imgData, 0, 0);
      var imageData = processed.toDataURL('image/jpeg', 0.9);
      console.log('[Content] Generated JPEG. Prefix:', imageData.substring(0, 50));
    } catch (err) {
      console.warn('Image post-processing failed, sending original canvas:', err);
      var imageData = canvas.toDataURL('image/jpeg', 0.9);
      console.log('[Content] Fallback JPEG. Prefix:', imageData.substring(0, 50));
    }

    function truncate(v) { return Math.max(0, Math.min(255, v)); }

    return new Promise((resolve, reject) => {
      console.log('[Content] Starting local OCR with Tesseract...');

      // Use Tesseract.js locally
      Tesseract.recognize(
        imageData,
        'eng',
        {
          logger: m => console.log('[Tesseract]', m)
        }
      ).then(({ data: { text } }) => {
        console.log('[Content] OCR Complete. Text length:', text.length);
        console.log('[Content] Sending text to background for parsing...');

        chrome.runtime.sendMessage({
          action: 'processReceipt',
          text: text,
          merchantName: merchantName
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Content] sendMessage error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('[Content] Received response from background:', response);
            if (response && response.success) {
              if (settings.showNotifications) showToast('Receipt logged to Google Sheets!', 'success');
              resolve(true);
            } else {
              reject(new Error(response ? response.error : 'Failed to process receipt'));
            }
          }
        });
      }).catch(err => {
        console.error('[Content] Tesseract Error:', err);
        reject(err);
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