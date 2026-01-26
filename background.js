// background.js

self.addEventListener('activate', (event) => console.log('Service worker activated'));
self.addEventListener('install', (event) => console.log('Service worker installed'));

// --- OCR and Google Sheets Logic ---

// OCR is now performed in content.js using Tesseract.js
// We just need to parse the text and log it.

// --- UPGRADED PARSING LOGIC (NOW MUCH SIMPLER) ---
function parseText(text, merchantFromPage) {
  if (!text) return null;

  console.log('--- Starting Robust Parsing ---');
  // Normalize whitespace and remove NBSPs
  const normalized = text.replace(/\r/g, '\n').replace(/\u00A0/g, ' ').trim();
  const lines = normalized.split(/\n+/).map(l => l.trim()).filter(Boolean);

  // Helper: parse amount string to a float
  function parseAmountString(s) {
    if (!s) return NaN;
    let cleaned = s.replace(/[^0-9.,]/g, '').trim();
    if (!cleaned) return NaN;
    // If both '.' and ',' present, decide which is decimal
    if (cleaned.indexOf('.') !== -1 && cleaned.indexOf(',') !== -1) {
      // If last '.' occurs after last ',', assume '.' is decimal
      if (cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',')) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        // comma is decimal
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleaned.indexOf(',') !== -1) {
      // If comma present, and there are exactly 2 digits after comma, assume decimal
      const parts = cleaned.split(',');
      if (parts[1] && parts[1].length === 2) {
        cleaned = parts.join('.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    }
    const val = parseFloat(cleaned);
    return isNaN(val) ? NaN : val;
  }

  // Collect all currency-like values from the whole text
  const currencyRegex = /(?:\$|£|€)?\s*([0-9]{1,3}(?:[,\.\s][0-9]{3})*(?:[.,][0-9]{2}))/g;
  const rawAmounts = [];
  let m;
  while ((m = currencyRegex.exec(normalized)) !== null) {
    rawAmounts.push(m[1]);
  }
  const amounts = rawAmounts.map(a => ({ raw: a, value: parseAmountString(a) })).filter(x => !isNaN(x.value));

  // Also capture plain integers that may represent totals (e.g., "762")
  const plainIntRegex = /(?:\$|£|€)?\s*(\b\d{2,6}\b)/g;
  const plainInts = [];
  while ((m = plainIntRegex.exec(normalized)) !== null) {
    const raw = m[1];
    // avoid duplicating ones already captured
    if (!rawAmounts.includes(raw)) plainInts.push(raw);
  }
  const intAmounts = plainInts.map(a => ({ raw: a, value: parseAmountString(a) })).filter(x => !isNaN(x.value));
  const allAmounts = [...amounts, ...intAmounts];

  console.log('[Parser] Lines extracted:', lines.length);
  // Debug: show top lines
  console.log('[Parser] First 10 lines:', lines.slice(0, 10));
  console.log('[Parser] Currency-like amounts found:', allAmounts.map(a => ({ raw: a.raw, value: a.value })));

  // Find total by keywords (prefer lines that explicitly mention total)
  const totalKeywords = ['grand total', 'order total', 'total due', 'amount due', 'amount paid', 'total:', 'total'];
  let foundTotal = null;
  let foundTotalLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const lower = line.toLowerCase();
    // skip obvious subtotals and lines that look like labels
    if (lower.replace(/\s+/g, '').includes('subtotal')) continue;
    if (lower.includes('subtotal') && lower.includes('total')) continue;
    for (const kw of totalKeywords) {
      if (lower.includes(kw)) {
        // Try to extract an amount on the same line
        const amtMatch = line.match(/(\$|£|€)?\s*\d+[,\.\d]*\d*/);
        if (amtMatch) {
          const parsed = parseAmountString(amtMatch[0]);
          if (!isNaN(parsed)) {
            foundTotal = { raw: amtMatch[0], value: parsed };
            foundTotalLineIndex = i;
            break;
          }
        }
        // If not on the same line, look for nearest currency on next 3 lines below
        for (let offset = 1; offset <= 3; offset++) {
          const near = lines[i + offset];
          if (!near) continue;
          const nearMatch = near.match(/(\$|£|€)?\s*\d+[,\.\d]*\d*/);
          if (nearMatch) {
            const parsed = parseAmountString(nearMatch[0]);
            if (!isNaN(parsed)) {
              foundTotal = { raw: nearMatch[0], value: parsed };
              foundTotalLineIndex = i + offset;
              break;
            }
          }
        }
      }
      if (foundTotal) break;
    }
    if (foundTotal) break;
  }

  // If we still don't have a total, pick the largest currency-looking number as fallback
  if (!foundTotal && allAmounts.length > 0) {
    // Prefer candidates that include an explicit decimal (likely real monetary amounts)
    const decimalCandidates = allAmounts.filter(a => /[.,]\d{2}$/.test(String(a.raw)));
    const pool = decimalCandidates.length > 0 ? decimalCandidates : allAmounts;
    const max = pool.reduce((a, b) => (a.value > b.value ? a : b));
    foundTotal = max;
    // attempt to find the line index where this numeric value appears
    const approx = String(foundTotal.raw).replace(/[\s,\u00A0]/g, '');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(foundTotal.raw) !== -1 || lines[i].replace(/[^0-9]/g, '').indexOf(approx) !== -1) {
        foundTotalLineIndex = i;
        break;
      }
    }
  }

  console.log('[Parser] Chosen total candidate:', foundTotal, 'at line index', foundTotalLineIndex);

  const total = foundTotal ? foundTotal.value.toFixed(2) : null;

  // Date extraction — check multiple common formats
  const datePatterns = [
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/,            // 11/10/2025 or 11-10-25
    /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/,              // 2025-10-11
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/i, // Oct 11, 2025
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+\d{2,4}\b/i // 11 Oct 2025
  ];
  let foundDate = null;
  for (const pat of datePatterns) {
    const dm = normalized.match(pat);
    if (dm) { foundDate = dm[0]; break; }
  }

  // Merchant: prefer the merchantFromPage if provided; otherwise try to find merchant near the total (above it), then fallback to top non-empty line
  function looksLikeMerchantLine(line) {
    if (!line || line.length < 3 || line.length > 60) return false;
    const lower = line.toLowerCase();
    // Reject lines containing common receipt words or numbers/currency
    if (/(receipt|invoice|order|total|subtotal|tax|qty|quantity|item|price|amount|date|time)/i.test(lower)) return false;
    if (/\d/.test(line)) return false; // contains digits -> likely not merchant name
    // Also reject lines that are just 'subtotal' with spaces/ocr artifacts
    if (lower.replace(/\s+/g, '').includes('subtotal')) return false;
    return true;
  }

  let merchant = null;
  if (merchantFromPage && merchantFromPage !== 'Unknown Merchant' && looksLikeMerchantLine(merchantFromPage)) {
    merchant = merchantFromPage;
  }
  if (!merchant && foundTotalLineIndex >= 0) {
    // scan up to 6 lines above the total for a merchant-like line
    for (let j = foundTotalLineIndex - 1; j >= Math.max(0, foundTotalLineIndex - 6); j--) {
      if (looksLikeMerchantLine(lines[j])) {
        merchant = lines[j];
        break;
      }
    }
  }
  if (!merchant) {
    for (const line of lines) {
      if (looksLikeMerchantLine(line)) { merchant = line; break; }
    }
  }

  // Last resort: use merchantFromPage even if 'Unknown Merchant' (but trim)
  if (!merchant && merchantFromPage) {
    merchant = merchantFromPage;
  }

  console.log('=== Parsing Complete ===');
  console.log('Merchant (from page):', merchantFromPage, '-> selected merchant:', merchant, 'Date:', foundDate, 'Total:', total);

  return {
    merchant: merchant || merchantFromPage || 'Unknown Merchant',
    date: foundDate || new Date().toLocaleDateString('en-US'),
    total: total || '0.00'
  };
}


async function appendToSheet(data) {
  // Retrieve spreadsheetId and token using callback-based chrome APIs (safer in service worker)
  return new Promise((resolve) => {
    chrome.storage.sync.get(['spreadsheetId'], (items) => {
      const spreadsheetId = items && items.spreadsheetId;
      if (!spreadsheetId) {
        console.error('[Sheets] spreadsheetId not set in storage');
        resolve({ success: false, error: 'Spreadsheet ID not set.' });
        return;
      }

      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          console.error('[Sheets] Failed to get auth token', chrome.runtime.lastError);
          resolve({ success: false, error: 'Not authenticated.' });
          return;
        }

        try {
          // Ensure header exists
          const getHeaderResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const headerData = await getHeaderResponse.json();

          if (!headerData || !headerData.values) {
            const headerBody = { values: [['Date', 'Merchant', 'Amount']] };
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(headerBody)
            });
          }

          const values = [[data.date, data.merchant, data.total]];
          const body = { values };
          const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ? result.error.message : 'Unknown Sheets API error');
          console.log('[Sheets] Append successful', result);
          resolve({ success: true });
        } catch (error) {
          console.error('[Sheets] Error appending to sheet:', error);
          resolve({ success: false, error: error.message || 'Unknown error' });
        }
      });
    });
  });
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processReceipt') {
    (async () => {
      // request.text now comes directly from Tesseract in content.js
      if (request.text) {
        const parsedData = parseText(request.text, request.merchantName);
        if (parsedData) {
          const sheetResponse = await appendToSheet(parsedData);
          sendResponse(sheetResponse);
        } else {
          sendResponse({ success: false, error: "Failed to parse OCR data." });
        }
      } else {
        sendResponse({ success: false, error: "No text received from OCR." });
      }
    })();
    return true; // Keep channel open for async response
  }

  // (Your other message handlers can remain here)
});

// ... (Your other functions like createContextMenu, onInstalled, etc., are fine)