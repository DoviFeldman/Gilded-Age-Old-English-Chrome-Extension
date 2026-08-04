const DEFAULTS = {
  apiBaseUrl: "https://api.groq.com/openai/v1/chat/completions",
  model: "llama-3.3-70b-versatile",
  autoConvert: false,
  viewportOnly: true,
  showFloatingButton: true,
  excludedSites: "",
  apiKey: ""
};

async function getSync() {
  return new Promise(res => chrome.storage.sync.get(DEFAULTS, r => res({...DEFAULTS, ...r})));
}
async function setSync(obj) {
  return new Promise(res => chrome.storage.sync.set(obj, () => res()));
}

function getActiveTab() {
  return new Promise(res => chrome.tabs.query({active:true, currentWindow:true}, tabs => res(tabs[0])));
}

async function updateStatus() {
  const statusEl = document.getElementById("status");
  const tab = await getActiveTab();
  if (!tab) { statusEl.textContent = "No active tab"; return; }

  try {
    const resp = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, {type:"GET_PAGE_STATUS"}, (r) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(r);
      });
    });

    const hostname = new URL(tab.url).hostname;
    const cfg = await getSync();
    const excluded = cfg.excludedSites.split("\n").map(s=>s.trim().toLowerCase()).filter(Boolean)
      .some(p => hostname.toLowerCase().includes(p));

    if (excluded) {
      statusEl.innerHTML = ` <b>${hostname}</b> is in excluded list. No rewriting here.<br><span style="font-size:10px">Remove in Options → Excluded Sites</span>`;
      statusEl.style.borderColor = "#a00";
      return;
    }

    if (!cfg.apiKey) {
      statusEl.innerHTML = ` No API key set!<br>Set your Groq or Cerebras key in Options. Your key is saved in chrome.storage.sync across whole browser.`;
      statusEl.style.borderColor = "#d4af37";
      return;
    }

    if (!resp) {
      statusEl.innerHTML = ` <b>${hostname}</b><br>Content script not ready. Refresh page if needed.<br>Mode: ${cfg.autoConvert ? (cfg.viewportOnly ? "Auto Viewport" : "Auto All") : "Manual"}`;
      return;
    }

    const mode = cfg.autoConvert ? (cfg.viewportOnly ? "Auto • Viewport Sipper" : "Auto • Whole Page") : "Manual Hotkey";
    statusEl.innerHTML = `
      <b>${hostname}</b> • ${resp.isGilded ? "🎩 <span style='color:#ffd700'>GILDED</span>" : "Original"}<br>
      Mode: ${mode} • ${resp.isProcessing ? "⏳ Processing..." : "Ready"}<br>
      <span style="font-size:10px; color:#8a7a60">Viewport mode saves tokens by only converting visible text</span>
    `;
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
  }
}

async function initUI() {
  const cfg = await getSync();
  const modeSelect = document.getElementById("modeSelect");
  const floatingCheck = document.getElementById("floatingCheck");

  if (cfg.autoConvert && cfg.viewportOnly) modeSelect.value = "auto_viewport";
  else if (cfg.autoConvert && !cfg.viewportOnly) modeSelect.value = "auto_all";
  else modeSelect.value = "manual";

  floatingCheck.checked = cfg.showFloatingButton;

  modeSelect.addEventListener("change", async () => {
    const v = modeSelect.value;
    if (v === "manual") await setSync({autoConvert:false, viewportOnly:true});
    else if (v === "auto_viewport") await setSync({autoConvert:true, viewportOnly:true});
    else await setSync({autoConvert:true, viewportOnly:false});
    updateStatus();
  });

  floatingCheck.addEventListener("change", async () => {
    await setSync({showFloatingButton: floatingCheck.checked});
  });

  document.getElementById("rewriteBtn").addEventListener("click", async () => {
    const tab = await getActiveTab();
    chrome.tabs.sendMessage(tab.id, {type:"REWRITE_NOW", viewportOnly:true}, updateStatus);
    window.close();
  });
  document.getElementById("rewriteAllBtn").addEventListener("click", async () => {
    const tab = await getActiveTab();
    chrome.tabs.sendMessage(tab.id, {type:"REWRITE_NOW", viewportOnly:false}, updateStatus);
    window.close();
  });
  document.getElementById("restoreBtn").addEventListener("click", async () => {
    const tab = await getActiveTab();
    chrome.tabs.sendMessage(tab.id, {type:"RESTORE_NOW"});
    window.close();
  });
  document.getElementById("optionsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("helpLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({url:"https://github.com"});
  });

  updateStatus();
}

document.addEventListener("DOMContentLoaded", initUI);
