// Configuration for auto-detection
let autoDetectEnabled = true;
let settings = {
  strongKeywords: [],
  supportingKeywords: [],
  detectionThreshold: 7,
  showNotifications: true,
  screenshotDelay: true,
  delayTime: 500,
  cropScreenshot: true,
  fileNameFormat: 'receipt_{date}_{time}'
};

// Add these variables at the top with other configurations
let hasScreenshotTaken = false;
let observerTimeout = null;

// Load settings from storage
chrome.storage.sync.get({
  // Default values
  autoDetect: true,
  showNotifications: true,
  detectionThreshold: 7,
  strongKeywords: [
    'receipt', 'invoice', 'order confirmation', 'payment confirmation',
    'tax invoice', 'billing statement', 'purchase receipt'
  ],
  supportingKeywords: [
    'subtotal', 'total', 'amount paid', 'order summary', 'tax', 
    'purchase', 'payment method', 'billing', 'order number',
    'transaction', 'date of purchase', 'merchant', 'item', 'quantity',
    'unit price', 'discount', 'payment', 'due date', 'account number'
  ],
  screenshotDelay: true,
  delayTime: 500,
  fileNameFormat: 'receipt_{date}_{time}'
}, function(items) {
  autoDetectEnabled = items.autoDetect;
  settings = items;
});

// Initialize and listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleAutoDetect') {
    autoDetectEnabled = message.enabled;
    sendResponse({success: true});
  } else if (message.action === 'takeScreenshot') {
    captureReceipt()
      .then(() => sendResponse({success: true}))
      .catch(error => {
        console.error('Screenshot error:', error);
        sendResponse({success: false, error: error.toString()});
      });
    return true;
  } else if (message.action === 'settingsUpdated') {
    settings = message.settings;
    autoDetectEnabled = settings.autoDetect;
    hasScreenshotTaken = false;
    setupDynamicDetection();
    sendResponse({success: true});
  } else if (message.action === 'manualCapture') {
    hasScreenshotTaken = false;
    detectReceipt().then(score => {
      if (score) {
        captureReceipt();
      }
    });
    sendResponse({success: true});
  }
});

// ==================== DETECTION LOGIC FROM detection.js ====================

// Main detection function (from detection.js - more sophisticated)
function detectReceipt() {
  return new Promise((resolve) => {
    try {
      const pageText = document.body.innerText.toLowerCase();
      const url = window.location.href.toLowerCase();
      
      // Convert threshold value to scoring requirements
      const threshold = settings.detectionThreshold || 7;
      const thresholdMultiplier = {
        5: 1.0,    // Very high sensitivity
        7: 1.2,    // High sensitivity (default)
        9: 1.5,    // Medium sensitivity
        11: 2.0    // Low sensitivity
      }[threshold] || 1.2;
      
      // URL-based pre-filtering with adjusted threshold
      const urlScore = getUrlScore(url) * thresholdMultiplier;
      
      // Check for strong keywords with context
      const strongKeywordScore = checkStrongKeywords(pageText, settings.strongKeywords) * thresholdMultiplier;
      if (strongKeywordScore === 0) {
        console.log('No strong keywords found - not a receipt');
        resolve(false);
        return;
      }

      // Collect all scores with adjusted weights
      const scores = {
        url: urlScore,
        strongKeyword: strongKeywordScore,
        structure: detectStructure() * thresholdMultiplier,
        content: analyzeContent(pageText, settings.supportingKeywords) * thresholdMultiplier,
        semantic: analyzeSemanticContext(pageText) * thresholdMultiplier,
        visual: checkVisualPatterns() * thresholdMultiplier,
        headerFooter: checkHeaderFooter() * thresholdMultiplier,
        pattern: recognizeReceiptPatterns(pageText) * thresholdMultiplier,
        negative: checkNegativeIndicators(pageText)
      };

      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
      
      // Log detection details
      console.log('Receipt detection scores:', {
        ...scores,
        total: totalScore,
        threshold: threshold,
        multiplier: thresholdMultiplier,
        isReceipt: totalScore >= threshold
      });
      
      resolve(totalScore >= threshold);
    } catch (error) {
      console.error('Error in receipt detection:', error);
      resolve(false);
    }
  });
}

function checkStrongKeywords(pageText, strongKeywords) {
  let score = 0;
  
  for (const keyword of strongKeywords) {
    if (pageText.includes(keyword.toLowerCase())) {
      score += 2;
      console.log('Strong keyword found:', keyword);
      break;
    }
  }
  
  return score;
}

function getUrlScore(url) {
  let score = 0;
  const receiptUrlPatterns = [
    /receipt/i, /invoice/i, /order.*confirm/i, 
    /payment.*confirm/i, /checkout.*confirm/i,
    /purchase.*confirm/i, /transaction/i
  ];

  // Check URL patterns
  for (const pattern of receiptUrlPatterns) {
    if (pattern.test(url)) {
      score += 2;
      break;
    }
  }

  // Common receipt domains
  const receiptDomains = [
    'receipt', 'invoice', 'billing', 
    'orders', 'checkout', 'payment'
  ];

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const domain of receiptDomains) {
      if (hostname.includes(domain)) {
        score += 1;
      }
    }
  } catch (e) {
    console.warn('URL parsing failed:', e);
  }

  return score;
}

function detectStructure() {
  let score = 0;

  // Safer table detection
  try {
    const tables = Array.from(document.getElementsByTagName('table'));
    for (const table of tables) {
      // Check if table has price-like content
      if (table.innerText.match(/[\$\€\£₹]\s*\d+[.,]\d{2}/)) {
        score += 2;
        break;
      }
    }
  } catch (e) {
    console.warn('Table detection failed:', e);
  }

  // Grid structure detection
  try {
    const gridContainers = [
      ...document.querySelectorAll('div[class*="grid"]'),
      ...document.querySelectorAll('div[class*="row"]'),
      ...document.querySelectorAll('div[style*="grid"]'),
      ...document.querySelectorAll('div[style*="flex"]')
    ];
    
    if (gridContainers.length > 0) {
      score += 1;
    }
  } catch (e) {
    console.warn('Grid detection failed:', e);
  }

  // List structure detection
  try {
    const lists = document.querySelectorAll('ul, ol');
    for (const list of lists) {
      if (list.children.length >= 2 && list.innerText.match(/[\$\€\£₹]\s*\d+[.,]\d{2}/)) {
        score += 1;
        break;
      }
    }
  } catch (e) {
    console.warn('List detection failed:', e);
  }

  return score;
}

function analyzeContent(pageText, supportingKeywords) {
  let score = 0;

  // Enhanced currency patterns
  const currencyPatterns = [
    /[\$\€\£₹]\s*\d+[,.]\d{2}/g,  // Standard format
    /\d+[,.]\d{2}\s*[\$\€\£₹]/g,   // Trailing currency
    /\d+[,.]\d{2}\s*(?:EUR|USD|GBP|CAD|AUD|JPY|CNY|INR)/gi,  // Currency codes
    /(?:EUR|USD|GBP|CAD|AUD|JPY|CNY|INR)\s*\d+[,.]\d{2}/gi,  // Leading currency codes
    /(?:total|subtotal|tax):\s*[\$\€\£₹]?\s*\d+[,.]\d{2}/gi  // Labeled amounts
  ];

  let totalCurrencyMatches = 0;
  for (const pattern of currencyPatterns) {
    const matches = pageText.match(pattern) || [];
    totalCurrencyMatches += matches.length;
  }

  if (totalCurrencyMatches >= 3) score += 3;

  // Supporting keywords with context
  let keywordScore = 0;
  for (const keyword of supportingKeywords) {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (keywordRegex.test(pageText)) {
      keywordScore++;
    }
  }

  if (keywordScore >= 3) score += 2;
  if (keywordScore >= 5) score += 2;

  // Date patterns
  const datePatterns = [
    /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/,
    /\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/,
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}/i
  ];

  for (const pattern of datePatterns) {
    if (pattern.test(pageText)) {
      score += 1;
      break;
    }
  }

  return score;
}

function analyzeSemanticContext(pageText) {
  let score = 0;
  
  const receiptPhrases = [
    /thank you for your (purchase|order)/i,
    /order (number|#):\s*\w+/i,
    /payment (processed|received)/i,
    /item\s+quantity\s+price/i,
    /billing address/i,
    /shipping address/i,
    /payment method/i
  ];
  
  for (const phrase of receiptPhrases) {
    if (phrase.test(pageText)) {
      score += 2;
    }
  }
  
  return score;
}

function checkVisualPatterns() {
  let score = 0;
  
  // Look for columns of aligned numbers (common in receipts)
  try {
    const textNodes = document.createTreeWalker(
      document.body, 
      NodeFilter.SHOW_TEXT
    );
    
    let numberAlignmentCount = 0;
    let node;
    while (node = textNodes.nextNode()) {
      if (/^\s*[\$\€\£₹]?\s*\d+[,.]\d{2}\s*$/.test(node.textContent)) {
        numberAlignmentCount++;
      }
    }
    
    if (numberAlignmentCount >= 3) score += 2;
  } catch (e) {
    console.warn('Number alignment check failed:', e);
  }
  
  // Check for receipt-like layout (items on left, prices on right)
  try {
    const contentDivs = document.querySelectorAll('div, p, li');
    let layoutMatchCount = 0;
    
    for (const div of contentDivs) {
      if (/^.{10,50}[\$\€\£₹]\s*\d+[,.]\d{2}\s*$/.test(div.textContent)) {
        layoutMatchCount++;
      }
    }
    
    if (layoutMatchCount >= 3) score += 2;
  } catch (e) {
    console.warn('Layout check failed:', e);
  }
  
  return score;
}

function checkHeaderFooter() {
  let score = 0;
  
  try {
    const headers = document.querySelectorAll('header, .header, h1, h2');
    for (const header of headers) {
      if (/(receipt|invoice|order confirmation|payment confirmation)/i.test(header.textContent)) {
        score += 3;
        break;
      }
    }
  } catch (e) {
    console.warn('Header check failed:', e);
  }
  
  try {
    const footers = document.querySelectorAll('footer, .footer');
    for (const footer of footers) {
      if (/(thank you for your (purchase|order)|keep this receipt)/i.test(footer.textContent)) {
        score += 2;
        break;
      }
    }
  } catch (e) {
    console.warn('Footer check failed:', e);
  }
  
  return score;
}

function recognizeReceiptPatterns(pageText) {
  let score = 0;
  
  // Check for typical receipt section ordering
  const sections = [
    /merchant|store|business name/gi,
    /date|time/g,
    /items|products|services/gi,
    /subtotal/gi,
    /tax/gi,
    /total/gi,
    /payment method/gi
  ];
  
  let lastFoundIndex = -1;
  let sequentialMatches = 0;
  
  for (const pattern of sections) {
    const matches = [...pageText.matchAll(pattern)];
    if (matches.length > 0) {
      const matchIndex = matches[0].index;
      if (matchIndex > lastFoundIndex) {
        sequentialMatches++;
        lastFoundIndex = matchIndex;
      }
    }
  }
  
  if (sequentialMatches >= 4) {
    score += 3;
  }
  
  return score;
}

function checkNegativeIndicators(pageText) {
  let negativeScore = 0;
  
  const negativePatterns = [
    /add to cart/i,
    /continue shopping/i,
    /product description/i,
    /customer reviews/i,
    /leave a comment/i,
    /sign up|register|create account/i,
    /search results/i,
    /related products/i,
    /you may also like/i
  ];
  
  for (const pattern of negativePatterns) {
    if (pattern.test(pageText)) {
      negativeScore += 2;
    }
  }
  
  return -negativeScore;
}

// ==================== RECEIPT CONTAINER FINDING LOGIC ====================

function findReceiptContainer() {
  try {
    const candidates = [];
    
    // Strategy 1: Look for receipt-specific class/id elements
    const receiptSelectors = [
      '[id*="receipt"]', '[class*="receipt"]',
      '[id*="invoice"]', '[class*="invoice"]',
      '[id*="order-confirmation"]', '[class*="order-confirmation"]',
      '[id*="order-details"]', '[class*="order-details"]',
      '[id*="payment-confirmation"]', '[class*="payment-confirmation"]'
    ];

    document.querySelectorAll(receiptSelectors.join(',')).forEach(el => {
      candidates.push({element: el, score: evaluateContainer(el)});
    });
    
    // Strategy 2: Look for elements with the most currency matches
    const elements = document.querySelectorAll('div, section, article, main');
    elements.forEach(el => {
      const currencyMatches = (el.innerText.match(/[\$\€\£₹]\s*\d+[,.]\d{2}/g) || []).length;
      if (currencyMatches >= 3) {
        candidates.push({element: el, score: currencyMatches + evaluateContainer(el)});
      }
    });
    
    // Strategy 3: Tables with item/price structure
    document.querySelectorAll('table').forEach(table => {
      const score = evaluateTable(table);
      if (score > 0) {
        candidates.push({element: table, score: score});
      }
    });
    
    // Sort candidates by score and select the best one
    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0 && candidates[0].score >= 3) {
      console.log('Best receipt container found:', {
        tag: candidates[0].element.tagName,
        id: candidates[0].element.id,
        score: candidates[0].score
      });
      return candidates[0].element;
    }
    
    // Fallback to main content
    return document.querySelector('main') || document.body;
  } catch (error) {
    console.warn('Error finding receipt container:', error);
    return document.body;
  }
}

function evaluateContainer(element) {
  let score = 0;
  const text = element.innerText.toLowerCase();
  
  // Check for essential receipt components
  if (/(sub)?total|amount paid|grand total/i.test(text)) score += 3;
  if (/order\s*(#|number|id)/i.test(text)) score += 2;
  if (/date|payment method/i.test(text)) score += 2;
  
  // Check price patterns
  const prices = text.match(/[\$\€\£₹]\s*\d+[,.]\d{2}/g) || [];
  score += Math.min(prices.length, 5);
  
  // Check layout structure
  if (element.querySelector('table')) score += 2;
  if (element.querySelectorAll('div[class*="row"], div[class*="item"]').length > 2) score += 2;
  
  // Check dimensions and position
  const rect = element.getBoundingClientRect();
  if (rect.width > 200 && rect.width < window.innerWidth * 0.9) score += 1;
  if (rect.height > 200 && rect.height < document.body.scrollHeight * 0.9) score += 1;

  return score;
}

function evaluateTable(table) {
  let score = 0;
  const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.toLowerCase());
  
  // Check for receipt-like columns
  if (headers.some(h => /(item|description|product)/i.test(h))) score += 2;
  if (headers.some(h => /(price|amount|total)/i.test(h))) score += 2;
  if (headers.some(h => /(quantity|qty)/i.test(h))) score += 1;
  
  // Check for price content
  const rows = table.querySelectorAll('tr');
  let priceColumns = 0;
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    cells.forEach(cell => {
      if (/[\$\€\£₹]\s*\d+[,.]\d{2}/.test(cell.textContent)) {
        priceColumns++;
      }
    });
  });
  
  if (rows.length > 0) {
    score += Math.min(priceColumns / rows.length, 3);
  }
  
  return score;
}

// ==================== UI & SCREENSHOT LOGIC ====================

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `receipt-extension-toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

async function captureReceipt() {
  try {
    const receiptElement = findReceiptContainer();
    
    if (!receiptElement) {
      console.error('No receipt element found');
      if (settings.showNotifications) {
        showToast('No receipt found on this page', 'error');
      }
      return false;
    }

    console.log('Receipt element found:', receiptElement);

    const elementToCapture = receiptElement;
    const padding = 20;

    const rect = elementToCapture.getBoundingClientRect();
    
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    const highlighter = document.createElement('div');
    highlighter.className = 'receipt-extension-highlighter';
    Object.assign(highlighter.style, {
      left: (rect.left - padding) + 'px',
      top: (rect.top - padding) + 'px',
      width: (rect.width + padding * 2) + 'px',
      height: (rect.height + padding * 2) + 'px'
    });
    document.body.appendChild(highlighter);

    elementToCapture.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    await new Promise(resolve => setTimeout(resolve, settings.delayTime || 500));

    if (settings.showNotifications) {
      showToast('Taking receipt screenshot...');
    }

    const canvas = await html2canvas(elementToCapture, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering: false,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });

    document.body.removeChild(highlighter);

    const imageData = canvas.toDataURL('image/png', 1.0);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    
    let websiteStr = 'unknown';
    try {
      websiteStr = window.location.hostname.replace(/^www\./, '') || 'unknown';
    } catch (e) {
      console.warn('Could not get hostname:', e);
    }

    let fileName = (settings.fileNameFormat || 'receipt_{date}_{time}')
      .replace('{date}', dateStr)
      .replace('{time}', timeStr)
      .replace('{website}', websiteStr);

    if (!fileName.toLowerCase().endsWith('.png')) {
      fileName += '.png';
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'saveScreenshot',
        imageData: imageData,
        originalUrl: window.location.href || 'about:blank',
        fileName: fileName
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else if (!response) {
          console.error('No response from background script');
          reject(new Error('No response from background script'));
        } else if (response.success) {
          if (settings.showNotifications) {
            showToast('Receipt saved successfully!');
          }
          resolve(true);
        } else {
          console.error('Save failed:', response.error);
          reject(new Error(response.error || 'Failed to save screenshot'));
        }
      });
    });

  } catch (error) {
    console.error('Error capturing receipt:', error);
    if (settings.showNotifications) {
      showToast('Error capturing receipt: ' + error.message, 'error');
    }
    return false;
  }
}

// ==================== DYNAMIC DETECTION ====================

function setupDynamicDetection() {
  const observer = new MutationObserver((mutations) => {
    if (hasScreenshotTaken) {
      observer.disconnect();
      return;
    }
    
    if (observerTimeout) {
      clearTimeout(observerTimeout);
    }
    
    observerTimeout = setTimeout(async () => {
      if (hasScreenshotTaken) return;
      
      const isReceipt = await detectReceipt();
      console.log('DOM change detection - Is receipt:', isReceipt);
      if (autoDetectEnabled && isReceipt) {
        console.log('Receipt detected after DOM change!');
        if (settings.showNotifications) {
          showToast('Receipt detected! Taking screenshot...');
        }
        hasScreenshotTaken = true;
        await captureReceipt();
        observer.disconnect();
      }
    }, 1000);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  document.addEventListener('click', async (e) => {
    if (hasScreenshotTaken) return;
    
    const target = e.target.closest('button, a, [role="button"], input[type="submit"]');
    if (!target) return;

    async function checkForReceipt(delay) {
      await new Promise(resolve => setTimeout(async () => {
        if (hasScreenshotTaken) {
          resolve();
          return;
        }
        
        const isReceipt = await detectReceipt();
        console.log(`Button click check after ${delay}ms - Is receipt:`, isReceipt);
        
        if (autoDetectEnabled && isReceipt) {
          console.log('Receipt detected after button click!');
          if (settings.showNotifications) {
            showToast('Receipt detected! Taking screenshot...');
          }
          hasScreenshotTaken = true;
          await captureReceipt();
        }
        resolve();
      }, delay));
    }

    for (const delay of [500, 1000, 2000]) {
      if (hasScreenshotTaken) break;
      await checkForReceipt(delay);
    }
  }, true);
}

window.addEventListener('load', async () => {
  if (hasScreenshotTaken) return;
  
  setTimeout(async () => {
    if (hasScreenshotTaken) return;
    
    if (autoDetectEnabled && await detectReceipt()) {
      console.log('Receipt detected on page load!');
      if (settings.showNotifications) {
        showToast('Receipt detected! Taking screenshot...');
      }
      hasScreenshotTaken = true;
      await captureReceipt();
    } else if (!hasScreenshotTaken) {
      setupDynamicDetection();
    }
  }, 1500);
});