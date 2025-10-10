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
    let bestCandidate = null;
    let highestScore = 0;

    // A focused list of keywords that define a receipt's summary section
    const receiptKeywords = ['subtotal', 'tax', 'shipping', 'discount', 'total', 'order number', 'order #', 'invoice #', 'grand total'];
    const allElements = document.body.querySelectorAll('div, table, section, article');

    allElements.forEach(element => {
        // Skip elements that are invisible or too small to be a receipt
        if (!element.offsetParent || element.getBoundingClientRect().height < 50) {
            return;
        }

        const elementText = element.innerText.toLowerCase();
        let score = 0;
        let foundKeywords = 0;

        // 1. Score based on how many critical keywords are CLUSTERED inside
        receiptKeywords.forEach(keyword => {
            if (elementText.includes(keyword)) {
                foundKeywords++;
            }
        });

        // This is the most important signal. A "distraction" div will only have 1-2 keywords.
        // A real receipt will have 3+.
        if (foundKeywords >= 3) {
            score = foundKeywords * 10; // Heavily weight clusters
        } else {
            return; // Not a strong enough candidate, ignore it.
        }
        
        // 2. --- AMAZON FIX ---
        // If it has the class you found AND "order summary", it's the one.
        if (element.className.includes('a-column') && element.className.includes('a-span12') && elementText.includes('order summary')) {
            score += 100; // Massive score boost
        }

        // 3. Bonus for having an explicit "grand total" or "order total"
        if (elementText.match(/(grand total|order total)/)) {
            score += 25;
        }

        // 4. Penalize huge elements
        if (element.getBoundingClientRect().width > window.innerWidth * 0.9) {
            score -= 50;
        }
        
        // 5. Penalize known distraction text
        if (elementText.includes('you might also like') || elementText.includes('trending') || elementText.includes('related products')) {
            score -= 100;
        }

        if (score > highestScore) {
            highestScore = score;
            bestCandidate = element;
        }
    });

    console.log(`[Receipt Finder] Best candidate score: ${highestScore}`, bestCandidate);

    if (highestScore > 30) {
        return bestCandidate;
    }

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
  let merchantName = findMerchantName();
  // sanitize merchantName: trim, remove newlines, reject generic labels
  merchantName = (merchantName || '').toString().replace(/\s+/g, ' ').trim();
  const badLabels = ['subtotal','total','invoice','order','receipt','amount','tax'];
  if (badLabels.includes(merchantName.toLowerCase())) merchantName = '';

    receiptElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 500));

    const canvas = await html2canvas(receiptElement, { scale: 2, useCORS: true });

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
        data[i+1] = truncate(factor * (data[i+1] - 128) + 128); // G
        data[i+2] = truncate(factor * (data[i+2] - 128) + 128); // B
        // alpha left as-is
      }
      ctx.putImageData(imgData, 0, 0);
      var imageData = processed.toDataURL('image/png', 1.0);
    } catch (err) {
      console.warn('Image post-processing failed, sending original canvas:', err);
      var imageData = canvas.toDataURL('image/png', 1.0);
    }

    function truncate(v) { return Math.max(0, Math.min(255, v)); }

    return new Promise((resolve, reject) => {
      console.log('[Content] Sending image to background for OCR...');
      chrome.runtime.sendMessage({ 
          action: 'processReceipt', 
          imageData: imageData,
          merchantName: merchantName // Pass the separately found merchant name
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