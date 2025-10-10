// background.js

self.addEventListener('activate', (event) => console.log('Service worker activated'));
self.addEventListener('install', (event) => console.log('Service worker installed'));

// --- OCR and Google Sheets Logic ---

const OCR_API_KEY = "K86118292388957";

async function performOCR(imageData) {
  // ... (this function is unchanged and correct)
  if (!OCR_API_KEY || OCR_API_KEY === "YOUR_API_KEY_HERE") {
    return { success: false, error: "OCR API Key not configured." };
  }
  const formData = new FormData();
  formData.append('base64Image', imageData);
  formData.append('isOverlayRequired', 'false');
  formData.append('apikey', OCR_API_KEY);
  formData.append('language', 'eng');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2');
  try {
    const response = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    const ocrResult = await response.json();
    if (ocrResult.IsErroredOnProcessing) {
      return { success: false, error: ocrResult.ErrorMessage[0] };
    }
    return { success: true, text: ocrResult.ParsedResults[0].ParsedText };
  } catch (error) {
    return { success: false, error: "Failed to connect to OCR service." };
  }
}

// --- UPGRADED PARSING LOGIC (NOW MUCH SIMPLER) ---
function parseText(text, merchantFromPage) {
    if (!text) return null;
    console.log("--- Raw OCR Text ---\n" + text + "\n--------------------");

    let date = null;
    let total = null;
    const lines = text.split('\n').map(line => line.trim());

    // Find the Total
    for (const line of lines.slice().reverse()) {
        const lowerLine = line.toLowerCase();
        if ((lowerLine.includes('total') || lowerLine.includes('amount')) && !lowerLine.includes('sub')) {
            const match = line.match(/(\d{1,5}[,.]\d{2})/);
            if (match) {
                total = match[1];
                break;
            }
        }
    }

    // Find the Date
    const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\w+\s\d{1,2},?\s\d{4})/i;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) date = dateMatch[0];

    console.log("=== Parsing Complete ===");
    console.log("Merchant (from page):", merchantFromPage, "Date:", date, "Total:", total);
    
    return { 
      merchant: merchantFromPage, // Use the reliable name passed from content.js
      date: date || new Date().toLocaleDateString('en-US'), 
      total: total || "0.00",
    };
}


async function appendToSheet(data) {
    // ... (this function is unchanged and correct)
    try {
        const { spreadsheetId } = await chrome.storage.sync.get('spreadsheetId');
        if (!spreadsheetId) throw new Error("Spreadsheet ID not set.");
        const { token } = await chrome.identity.getAuthToken({ interactive: false });
        if (!token) throw new Error("Not authenticated.");

        const getHeaderResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const headerData = await getHeaderResponse.json();

        if (!headerData.values) {
            const headerBody = { values: [['Date', 'Merchant', 'Amount']] };
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(headerBody)
            });
        }

        const values = [[ data.date, data.merchant, data.total ]];
        const body = { values };
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error.message);
        return { success: true };
    } catch (error) {
        console.error('Error appending to sheet:', error);
        return { success: false, error: error.message };
    }
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processReceipt') {
    (async () => {
      const ocrResponse = await performOCR(request.imageData);
      if (ocrResponse.success) {
        // Pass the merchantName from the request into the parser
        const parsedData = parseText(ocrResponse.text, request.merchantName); 
        if (parsedData) {
            const sheetResponse = await appendToSheet(parsedData);
            sendResponse(sheetResponse);
        } else {
            sendResponse({ success: false, error: "Failed to parse OCR data." });
        }
      } else {
        sendResponse(ocrResponse);
      }
    })();
    return true; // Keep channel open for async response
  }
  
  // (Your other message handlers can remain here)
});

// ... (Your other functions like createContextMenu, onInstalled, etc., are fine)