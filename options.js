const DEFAULTS = {
  apiKey: "",
  apiBaseUrl: "https://api.groq.com/openai/v1/chat/completions",
  model: "llama-3.3-70b-versatile",
  autoConvert: false,
  viewportOnly: true,
  showFloatingButton: true,
  excludedSites: "mail.google.com\naccounts.google.com\ndocs.google.com\n*.banking.*\nlocalhost",
  showKeyInLogs: false
};

function load() {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    const c = {...DEFAULTS, ...cfg};
    document.getElementById("apiKey").value = c.apiKey;
    document.getElementById("apiBaseUrl").value = c.apiBaseUrl;
    document.getElementById("model").value = c.model;
    document.getElementById("excludedSites").value = c.excludedSites;
    document.getElementById("floatingButton").checked = c.showFloatingButton;
    document.getElementById("showKeyInLogs").checked = c.showKeyInLogs;

    const modeSel = document.getElementById("startupMode");
    if (c.autoConvert && c.viewportOnly) modeSel.value = "auto_viewport";
    else if (c.autoConvert && !c.viewportOnly) modeSel.value = "auto_all";
    else modeSel.value = "manual";
  });
}

function save() {
  const modeVal = document.getElementById("startupMode").value;
  let autoConvert = false, viewportOnly = true;
  if (modeVal === "auto_viewport") { autoConvert = true; viewportOnly = true; }
  if (modeVal === "auto_all") { autoConvert = true; viewportOnly = false; }

  const data = {
    apiKey: document.getElementById("apiKey").value.trim(),
    apiBaseUrl: document.getElementById("apiBaseUrl").value.trim(),
    model: document.getElementById("model").value.trim(),
    excludedSites: document.getElementById("excludedSites").value,
    showFloatingButton: document.getElementById("floatingButton").checked,
    showKeyInLogs: document.getElementById("showKeyInLogs").checked,
    autoConvert,
    viewportOnly
  };

  chrome.storage.sync.set(data, () => {
    const el = document.getElementById("saved");
    el.style.display = "block";
    el.textContent = "✨ Saved! Settings synced across your browser profile (chrome.storage.sync). API key will not be deleted.";
    setTimeout(()=> el.style.display="none", 3500);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("saveBtn").addEventListener("click", save);
  document.getElementById("toggleKey").addEventListener("click", (e) => {
    e.preventDefault();
    const inp = document.getElementById("apiKey");
    if (inp.type === "password") { inp.type="text"; e.target.textContent="Hide"; }
    else { inp.type="password"; e.target.textContent="Show"; }
  });
});
