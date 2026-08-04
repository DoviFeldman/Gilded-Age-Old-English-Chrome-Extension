# Gilded-Age-Old-English-Chrome-Extension

🎩 Gilded Age Rewriter — Chrome Extension
Rewrites all text on any webpage into ornate old Gilded Age English (1880s).

Runs 100% locally in your browser. No backend. Optimized for super fast AI APIs like Groq or Cerebras — thinking is shut off for sub-200ms speed.

Features
Fully Local: Content script extracts text locally, background worker calls YOUR API directly. No proxy.
API Key Persistence: Stored in chrome.storage.sync — remembered across your entire Chrome profile, synced to all devices, doesn't get deleted on cache clear.
Exclude List: Page for websites you want to exclude (supports * wildcards, e.g. *.google.com, mail.google.com)
Three Modes to Save Tokens:
Automatic whole-page: Converts as soon as you visit.
Top-right popup + Hotkey: Manual. Extension shows as a floating 🎩 pill in top-right. Press Ctrl+Shift+G / Cmd+Shift+G to toggle.
Viewport Sipper (Recommended): Only converts text currently in view / that you scroll to. Saves ~70% tokens — doesn't waste tokens if you don't read whole site.
Optimized for Fast APIs:
System prompt explicitly says Thinking shut off. Reasoning params (reasoning_effort / reasoning_format) are sent only to models that actually support them, with per-family valid values (e.g. "none" for qwen3, "low" for gpt-oss) — non-reasoning models like llama-3.3-70b get none, and any param a provider rejects with a 400 is dropped and the request retried.
Batches 10 phrases in one JSON call
Works with Groq https://api.groq.com/openai/v1/chat/completions and Cerebras https://api.cerebras.ai/v1/chat/completions
Install (Developer Mode)
Download / unzip this folder.

Go to chrome://extensions → enable Developer mode top-right

Click Load unpacked → select this folder

Go to Extension Options (or click ⚙️ in the popup):

Paste your Groq API key (gsk_...) or Cerebras key (csk_...)
Set Base URL:
Groq: https://api.groq.com/openai/v1/chat/completions
Cerebras: https://api.cerebras.ai/v1/chat/completions
Set Model:
Groq fastest: llama-3.1-8b-instant
Groq quality: llama-3.3-70b-versatile
Cerebras: llama3.1-8b
Add excluded sites
Choose Auto / Manual / Viewport mode
Save
Visit any site. Press Ctrl+Shift+G or click the floating 🎩 button.

How Token Saving Works
ViewportOnly: getTextNodes(true) checks getBoundingClientRect() — only nodes in viewport + 200px margin.
On scroll, new nodes are batch-rewritten.
IntersectionObserver watches for newly visible sections.
Excluded tags: SCRIPT, STYLE, CODE, PRE, INPUT, TEXTAREA are never sent.
API Key Storage
JavaScript

chrome.storage.sync.set({apiKey, apiBaseUrl, model, excludedSites, autoConvert, viewportOnly})
This uses Chrome's synced storage: survives browser restart, profile sync, not cleared by "Clear browsing data". Only removed if you uninstall the extension or clear extension storage manually.

Hotkey
Default: Ctrl+Shift+G (Mac: Command+Shift+G)
Change at: chrome://extensions/shortcuts

Permissions Justification
storage: for API key & settings sync across browser
activeTab + scripting: to inject rewrite logic
<all_urls>: to work on any site you allow (except excluded list)
Enjoy thy new opulent internet, dear patron!
