// Background service worker - handles super fast API calls (Groq / Cerebras)
// No thinking, no reasoning, max speed

const DEFAULT_CONFIG = {
  apiKey: "",
  apiBaseUrl: "https://api.groq.com/openai/v1/chat/completions",
  model: "llama-3.3-70b-versatile",
  autoConvert: false,
  viewportOnly: true,
  showFloatingButton: true,
  excludedSites: ""
};

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...stored };
}

// Optimized for Groq & Cerebras - thinking disabled
async function callFastAPI(texts) {
  const config = await getConfig();
  
  if (!config.apiKey) {
    throw new Error("API key not set. Open extension options and add your Groq or Cerebras key.");
  }

  // System prompt: explicitly shut off thinking for speed
  const systemPrompt = `You are a Gilded Age English translator, circa 1885 New York high society.

RULES - CRITICAL FOR SPEED:
- Thinking is SHUT OFF. Do NOT use <think> tags, chain-of-thought, or reasoning. Output ONLY the final translations.
- You are optimized for SUPER FAST APIs like Groq and Cerebras. Be instant.
- Translate each input string into ornate, elaborate Gilded Age Victorian English. Think Mark Twain, Edith Wharton, grand parlors, opulent phrasing, "I daresay", "most esteemed", "hitherto", "forthwith", but still readable.
- Keep meaning identical. Keep names, numbers, URLs, code unchanged.
- DO NOT add explanations, quotes, or extra text.
- You MUST return VALID JSON ONLY with this exact shape: {"rewritten": ["translation1", "translation2", ...]}
- Array length MUST exactly match input length.
- Each translation should be similar length to original, just more ornate.

Example: "Hello, how are you?" -> "Good day to you, dear sir, how dost thou fare on this fine afternoon?"`;

  const userContent = `Translate this JSON array to Gilded Age English. Return ONLY {"rewritten":[...]}.
Input: ${JSON.stringify(texts)}`;

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.7,
    max_tokens: 4000,
    // Params to disable thinking on various providers
    reasoning_effort: "disable",
    reasoning_format: "hidden",
    // Groq specific
    // @ts-ignore
    parallel_tool_calls: false
  };

  // Cerebras / Groq both support OpenAI-compatible chat completions
  const res = await fetch(config.apiBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error ${res.status}: ${errText.slice(0,500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Try to parse JSON
  try {
    // Remove markdown fences if model adds them
    const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.rewritten && Array.isArray(parsed.rewritten)) {
      return parsed.rewritten;
    }
    // Fallback if wrapped
    if (Array.isArray(parsed)) return parsed;
    throw new Error("Invalid JSON shape");
  } catch (e) {
    console.warn("Failed to parse JSON, trying to salvage:", content);
    // Attempt to extract array via regex as fallback
    try {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const arr = JSON.parse(match[0]);
        if (arr.length === texts.length) return arr;
      }
    } catch {}
    throw new Error("Model did not return valid JSON. Try a faster model like llama-3.1-8b-instant (Groq) or llama3.1-8b (Cerebras). Raw: " + content.slice(0,200));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "REWRITE_BATCH") {
    callFastAPI(msg.texts)
      .then(rewritten => sendResponse({ success: true, rewritten }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
  if (msg.type === "GET_CONFIG") {
    getConfig().then(cfg => sendResponse(cfg));
    return true;
  }
  if (msg.type === "CHECK_EXCLUDED") {
    getConfig().then(cfg => {
      const list = cfg.excludedSites.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean);
      const host = msg.hostname?.toLowerCase() || "";
      const isExcluded = list.some(pattern => {
        if (pattern.includes("*")) {
          const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
          return re.test(host);
        }
        return host.includes(pattern);
      });
      sendResponse({ isExcluded });
    });
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-rewrite") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "HOTKEY_TOGGLE" });
      }
    });
  }
});
