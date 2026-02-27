(() => {
  const MAX_SELECTION_LENGTH = 1200;
  const BUTTON_ID = "tone-rewrite-inline-button";
  const TOAST_ID = "tone-rewrite-inline-toast";
  const PENDING_LABEL = "rewriting...";
  const READY_LABEL = "✨ Rewrite";

  let selectedText = "";
  let selectedRange = null;
  let pending = false;

  const button = createButton();
  const toast = createToast();

  document.addEventListener("selectionchange", handleSelectionChange, true);
  document.addEventListener("mouseup", handleSelectionChange, true);
  window.addEventListener("scroll", () => {
    if (isButtonVisible()) {
      positionButton();
    }
  }, true);

  function handleSelectionChange() {
    if (pending) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideButton();
      return;
    }

    const range = selection.getRangeAt(0);
    const text = normalize(selection.toString());
    if (!text) {
      hideButton();
      return;
    }

    if (isForbiddenTarget(range)) {
      hideButton();
      return;
    }

    selectedText = text;
    selectedRange = range.cloneRange();
    showButton();
    positionButton();
  }

  function isForbiddenTarget(range) {
    const element = getClosestElement(range.commonAncestorContainer);
    if (!element) return false;
    if (element.closest("input, textarea")) return true;
    if (element.isContentEditable) return true;
    if (element.closest('[contenteditable=""], [contenteditable="true"]')) return true;
    return false;
  }

  function getClosestElement(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    return node.parentElement || null;
  }

  function createButton() {
    let el = document.getElementById(BUTTON_ID);
    if (el) return el;

    el = document.createElement("button");
    el.id = BUTTON_ID;
    el.type = "button";
    el.textContent = READY_LABEL;
    el.style.position = "fixed";
    el.style.zIndex = "2147483647";
    el.style.display = "none";
    el.style.padding = "6px 8px";
    el.style.fontSize = "12px";
    el.style.lineHeight = "1";
    el.style.border = "1px solid #d0d7de";
    el.style.borderRadius = "8px";
    el.style.background = "#111827";
    el.style.color = "#ffffff";
    el.style.cursor = "pointer";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";

    el.addEventListener("mousedown", (event) => event.preventDefault());
    el.addEventListener("click", onRewriteClick);

    document.documentElement.appendChild(el);
    return el;
  }

  function createToast() {
    let el = document.getElementById(TOAST_ID);
    if (el) return el;

    el = document.createElement("div");
    el.id = TOAST_ID;
    el.style.position = "fixed";
    el.style.bottom = "20px";
    el.style.right = "20px";
    el.style.zIndex = "2147483647";
    el.style.display = "none";
    el.style.maxWidth = "320px";
    el.style.padding = "10px 12px";
    el.style.fontSize = "12px";
    el.style.borderRadius = "8px";
    el.style.background = "rgba(17, 24, 39, 0.95)";
    el.style.color = "#fff";
    el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";

    document.documentElement.appendChild(el);
    return el;
  }

  async function onRewriteClick() {
    if (pending) return;

    if (!selectedRange || !selectedText) {
      showToast("Please select text first.");
      hideButton();
      return;
    }

    if (selectedText.length > MAX_SELECTION_LENGTH) {
      showToast(`Selection is too long (${selectedText.length}/${MAX_SELECTION_LENGTH}).`);
      return;
    }

    if (isForbiddenTarget(selectedRange)) {
      showToast("Rewriting in input/textarea/contentEditable is not supported.");
      hideButton();
      return;
    }

    setPending(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "REWRITE_SELECTION",
        text: selectedText
      });

      if (!response?.ok || !response?.result?.rewrittenText) {
        throw new Error(response?.error || "Rewrite failed.");
      }

      replaceSelectedRange(response.result.rewrittenText);
      hideButton();
    } catch (error) {
      showToast(error?.message || "Failed to rewrite selection.");
    } finally {
      setPending(false);
    }
  }

  function replaceSelectedRange(newText) {
    if (!selectedRange) return;

    const safeText = normalize(newText);
    if (!safeText) return;

    const range = selectedRange.cloneRange();
    range.deleteContents();
    const node = document.createTextNode(safeText);
    range.insertNode(node);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }

    selectedRange = null;
    selectedText = "";
  }

  function positionButton() {
    if (!selectedRange) return;

    const rect = selectedRange.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideButton();
      return;
    }

    const offset = 8;
    const left = Math.min(window.innerWidth - 100, rect.right + offset);
    const top = Math.min(window.innerHeight - 40, rect.bottom + offset);

    button.style.left = `${Math.max(8, left)}px`;
    button.style.top = `${Math.max(8, top)}px`;
  }

  function showButton() {
    button.style.display = "block";
  }

  function hideButton() {
    button.style.display = "none";
    selectedRange = null;
    selectedText = "";
  }

  function isButtonVisible() {
    return button.style.display !== "none";
  }

  function setPending(value) {
    pending = value;
    button.disabled = value;
    button.style.opacity = value ? "0.7" : "1";
    button.style.cursor = value ? "default" : "pointer";
    button.textContent = value ? PENDING_LABEL : READY_LABEL;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.style.display = "block";
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.style.display = "none";
    }, 2800);
  }

  function normalize(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }
})();
