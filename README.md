### RECEIPT SCREENSHOT EXTENSION ###

Currently a simple chrome extension that detects receipts on a webpage and automatically crops and takes screenshot which are saved locally (for now)

***Currently in Beta testing***

Extension Flow

1. Page Load:
   - content.js initializes
   - Loads saved settings
   - Performs initial receipt check

2. Detection Process:
   - Scans page content
   - Calculates detection score
   - Identifies receipt container

3. Screenshot Process:
   - Highlights receipt area
   - Captures screenshot
   - Sends to background.js

4. Dynamic Detection:
   - Monitors page changes
   - Watches for button clicks
   - Re-checks for receipts

