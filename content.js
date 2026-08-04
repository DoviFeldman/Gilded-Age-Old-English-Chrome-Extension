// Content script - runs fully locally in your browser
(() => {
  let originalMap = new Map(); // TextNode -> originalText
  let isGilded = false;
  let isProcessing = false;
  let floatingBtn = null;
  let observer = null;

  const EXCLUDE_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "CANVAS", "CODE", "PRE", "INPUT", "TEXTAREA", "SELECT"]);

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInViewport(textNode) {
    const parent = textNode.parentElement;
    if (!parent) return false;
    const rect = parent.getBoundingClientRect();
    return (
      rect.top < window.innerHeight + 200 &&
      rect.bottom > -200 &&
      rect.left < window.innerWidth + 200 &&
      rect.right > -200
    );
  }

  function getTextNodes(viewportOnly) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (EXCLUDE_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-gilded-ignore]')) return NodeFilter.FILTER_REJECT;
        if (parent.hasAttribute('data-gilded-done')) return NodeFilter.FILTER_REJECT;
        const text = node.nodeValue;
        if (!text || text.trim().length < 3) return NodeFilter.FILTER_REJECT;
        if (text.trim().length > 500) return NodeFilter.FILTER_REJECT; // skip huge blobs
        if (/^\s*$/.test(text)) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (viewportOnly && !isInViewport(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
      if (nodes.length > 80) break; // limit per batch run to save tokens
    }
    return nodes;
  }

  async function getConfig() {
    return new Promise(res => {
      chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (cfg) => res(cfg));
    });
  }

  async function checkExcluded() {
    return new Promise(res => {
      chrome.runtime.sendMessage({ type: "CHECK_EXCLUDED", hostname: location.hostname }, (r) => {
        res(r?.isExcluded || false);
      });
    });
  }

  async function rewriteBatch(nodes) {
    if (nodes.length === 0) return;
    const texts = nodes.map(n => n.nodeValue.trim());

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "REWRITE_BATCH", texts }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        });
      });

      if (!response.success) throw new Error(response.error);

      const rewritten = response.rewritten;
      if (rewritten.length !== nodes.length) {
        console.warn("Length mismatch", rewritten.length, nodes.length);
      }

      nodes.forEach((node, i) => {
        const orig = node.nodeValue;
        if (!originalMap.has(node)) originalMap.set(node, orig);
        if (rewritten[i]) {
          // Preserve leading/trailing whitespace
          const leading = orig.match(/^\s*/)[0];
          const trailing = orig.match(/\s*$/)[0];
          node.nodeValue = leading + rewritten[i] + trailing;
          node.parentElement.setAttribute('data-gilded-done', '1');
        }
      });

      isGilded = true;
      updateFloatingButton();
    } catch (e) {
      console.error("[Gilded] Rewrite failed:", e);
      // Show non-intrusive error in floating btn
      if (floatingBtn) {
        floatingBtn.textContent = "⚠️ " + e.message.slice(0,60);
        floatingBtn.style.background = "#a00";
        setTimeout(() => updateFloatingButton(), 4000);
      }
    }
  }

  async function rewriteAll(viewportOnly) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const isExcluded = await checkExcluded();
      if (isExcluded) {
        console.log("[Gilded] Site excluded");
        isProcessing = false;
        return;
      }

      const nodes = getTextNodes(viewportOnly);
      if (nodes.length === 0) {
        isProcessing = false;
        return;
      }

      // Chunk into groups of 10 to keep JSON small & fast for Groq/Cerebras
      const chunkSize = 10;
      for (let i = 0; i < nodes.length; i += chunkSize) {
        const chunk = nodes.slice(i, i + chunkSize);
        await rewriteBatch(chunk);
        // Small delay to avoid rate limits but keep speed
        await new Promise(r => setTimeout(r, 100));
      }
    } finally {
      isProcessing = false;
    }
  }

  function restoreAll() {
    originalMap.forEach((orig, node) => {
      try { node.nodeValue = orig; } catch {}
      if (node.parentElement) node.parentElement.removeAttribute('data-gilded-done');
    });
    originalMap.clear();
    isGilded = false;
    updateFloatingButton();
  }

  function createFloatingButton() {
    if (document.getElementById("gilded-floating-btn")) return;
    const btn = document.createElement("div");
    btn.id = "gilded-floating-btn";
    btn.setAttribute("data-gilded-ignore", "1");
    Object.assign(btn.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "2147483647",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      color: "#ffd700",
      border: "2px solid #d4af37",
      borderRadius: "30px",
      padding: "10px 16px",
      fontFamily: "Georgia, serif",
      fontSize: "13px",
      fontWeight: "bold",
      cursor: "pointer",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,215,0,0.2)",
      letterSpacing: "0.5px",
      transition: "all 0.2s",
      userSelect: "none"
    });
    btn.addEventListener("mouseenter", () => btn.style.transform = "scale(1.05)");
    btn.addEventListener("mouseleave", () => btn.style.transform = "scale(1)");
    btn.addEventListener("click", () => {
      if (isGilded) restoreAll();
      else rewriteAll(true); // default to viewport to save tokens
    });
    document.body.appendChild(btn);
    floatingBtn = btn;
    updateFloatingButton();
  }

  function updateFloatingButton() {
    if (!floatingBtn) return;
    if (isProcessing) {
      floatingBtn.textContent = "✨ Transmuting...";
      floatingBtn.style.background = "#2c2c44";
    } else if (isGilded) {
      floatingBtn.textContent = "↺ Restore Original";
      floatingBtn.style.background = "linear-gradient(135deg, #2d2d2d, #1a1a1a)";
    } else {
      floatingBtn.textContent = "🎩 Gilded Rewrite (Ctrl+Shift+G)";
      floatingBtn.style.background = "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)";
    }
  }

  // Viewport sipper - auto rewrite new visible nodes on scroll (token saving)
  function setupViewportObserver() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(async (entries) => {
      const cfg = await getConfig();
      if (!cfg.autoConvert || !cfg.viewportOnly || !isGilded && !cfg.autoConvert) return;
      const nodesToRewrite = [];
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const walker = document.createTreeWalker(entry.target, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              const p = node.parentElement;
              if (!p || p.hasAttribute('data-gilded-done') || EXCLUDE_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
              if (!node.nodeValue || node.nodeValue.trim().length < 3) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          let n;
          while ((n = walker.nextNode())) nodesToRewrite.push(n);
        }
      }
      if (nodesToRewrite.length > 0) rewriteBatch(nodesToRewrite.slice(0, 20));
    }, { rootMargin: "200px" });

    // Observe major containers
    document.querySelectorAll("p, div, article, section, h1,h2,h3,li,span").forEach(el => {
      if (isVisible(el)) observer.observe(el);
    });
  }

  async function init() {
    const cfg = await getConfig();
    const excluded = await checkExcluded();
    if (excluded) return;

    if (cfg.showFloatingButton) {
      // Wait for body
      if (document.body) createFloatingButton();
      else window.addEventListener("DOMContentLoaded", createFloatingButton);
    }

    if (cfg.autoConvert) {
      // Slight delay to let page settle
      setTimeout(() => {
        rewriteAll(cfg.viewportOnly);
        if (cfg.viewportOnly) setupViewportObserver();
      }, 800);
    }

    // Scroll handler for viewport mode when manually triggered
    let scrollTimeout;
    window.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(async () => {
        const c = await getConfig();
        if (c.viewportOnly && isGilded) {
          const newNodes = getTextNodes(true);
          if (newNodes.length > 0) rewriteBatch(newNodes.slice(0, 15));
        }
      }, 500);
    }, { passive: true });
  }

  // Listen for popup / hotkey
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "REWRITE_NOW") {
      rewriteAll(msg.viewportOnly ?? true).then(() => sendResponse({ ok: true, gilded: isGilded }));
      return true;
    }
    if (msg.type === "RESTORE_NOW") {
      restoreAll();
      sendResponse({ ok: true });
    }
    if (msg.type === "HOTKEY_TOGGLE") {
      if (isGilded) restoreAll();
      else getConfig().then(c => rewriteAll(c.viewportOnly));
    }
    if (msg.type === "GET_PAGE_STATUS") {
      sendResponse({ isGilded, isProcessing, hostname: location.hostname });
    }
  });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      if (isGilded) restoreAll();
      else getConfig().then(c => rewriteAll(c.viewportOnly));
    }
  });

  init();
})();
