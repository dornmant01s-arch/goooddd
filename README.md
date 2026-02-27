# Comment Tone Rewriter (Chrome Extension, Manifest V3)

This extension scans visible comments on web pages, detects toxic/negative sentiment via Google Gemini, rewrites those comments to a more neutral/positive tone, and injects a small toggle button to view original text.

## Files

- `manifest.json` — Manifest V3 config, action button, and background service worker wiring for click-to-run behavior.
- `content.js` — Scans visible comment-like DOM nodes, observes dynamic updates with `MutationObserver`, sends text for analysis/rewrite, and updates DOM with toggle button.
- `background.js` — Handles Gemini API calls via `fetch` from the service worker so the content script does not directly access the API key.

## Setup

1. **Create Gemini API key**
   - Get an API key from Google AI Studio.

2. **Load extension in Chrome**
   - Go to `chrome://extensions`.
   - Enable **Developer mode**.
   - Click **Load unpacked** and choose this folder.

3. **Set API key in extension storage**
   - Open your extension's service worker console from `chrome://extensions` (click "service worker" under the extension).
   - Run:

   ```js
   chrome.storage.local.set({ GEMINI_API_KEY: "YOUR_GEMINI_API_KEY" });
   ```

4. **Browse any site with comments**
   - Click the extension icon to inject `content.js` into the current active tab.
   - The script scans visible comment-like text and rewrites toxic/negative comments.
   - Click **Show original** to toggle between rewritten and original text.

## Notes

- The API key is kept out of content scripts and only used in `background.js`.
- Chrome extensions cannot fully hide secrets from a determined local user; for production security, proxy Gemini requests through your own backend.
- Comment detection is heuristic because websites use many DOM patterns.


Uses Gemini model: `gemini-pro` via `v1beta/models/gemini-pro:generateContent`.
