const COMMENT_SELECTORS = [
  '[data-testid*="comment" i]',
  '[class*="comment" i]',
  '[id*="comment" i]',
  'article',
  '[role="article"]',
  'li',
  'p'
];

const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 900;
const PROCESSED_TEXT = new WeakMap();
const ORIGINAL_TEXT = new WeakMap();

if (window.__COMMENT_TONE_REWRITER_RUNNING__) {
  console.debug("Comment Tone Rewriter is already running on this tab.");
} else {
  window.__COMMENT_TONE_REWRITER_RUNNING__ = true;
  init();
}

function init() {
  scanDocument(document);
  observeMutations();
}

function observeMutations() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanDocument(node);
          }
        });
      }

      if (mutation.type === "characterData") {
        const parent = mutation.target?.parentElement;
        if (parent) scanElement(parent);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function scanDocument(root) {
  if (!root?.querySelectorAll) return;

  const selector = COMMENT_SELECTORS.join(",");
  const candidates = root.querySelectorAll(selector);
  candidates.forEach((element) => scanElement(element));
}

function scanElement(element) {
  if (!isVisible(element)) return;

  const textNode = findPrimaryTextNode(element);
  if (!textNode) return;

  const text = normalizeWhitespace(textNode.textContent || "");
  if (!isLikelyComment(text)) return;

  const previous = PROCESSED_TEXT.get(textNode);
  if (previous === text) return;

  PROCESSED_TEXT.set(textNode, text);
  maybeRewriteComment(textNode, text);
}

function isVisible(element) {
  if (!(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isLikelyComment(text) {
  if (!text) return false;
  if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount >= 4;
}

function findPrimaryTextNode(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = normalizeWhitespace(node.textContent || "");
      if (!value || value.length < MIN_TEXT_LENGTH) return NodeFilter.FILTER_REJECT;
      if (!node.parentElement || !isVisible(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let bestNode = null;
  let bestLength = 0;
  while (walker.nextNode()) {
    const current = walker.currentNode;
    const length = normalizeWhitespace(current.textContent || "").length;
    if (length > bestLength) {
      bestLength = length;
      bestNode = current;
    }
  }
  return bestNode;
}

async function maybeRewriteComment(textNode, originalText) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_AND_REWRITE",
      text: originalText
    });

    if (!response?.ok || !response.result?.shouldRewrite) return;

    const rewrittenText = normalizeWhitespace(response.result.rewrittenText || "");
    if (!rewrittenText || rewrittenText === originalText) return;

    ORIGINAL_TEXT.set(textNode, originalText);
    textNode.textContent = rewrittenText;
    attachToggleButton(textNode);
  } catch (error) {
    console.debug("Skipping comment rewrite", error);
  }
}

function attachToggleButton(textNode) {
  const parent = textNode.parentElement;
  if (!parent || parent.querySelector('[data-tone-toggle="true"]')) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.toneToggle = "true";
  button.textContent = "Show original";
  button.style.marginLeft = "6px";
  button.style.fontSize = "11px";
  button.style.cursor = "pointer";
  button.style.border = "1px solid #bbb";
  button.style.background = "#fff";
  button.style.borderRadius = "4px";
  button.style.padding = "1px 6px";

  let showingOriginal = false;
  const rewritten = textNode.textContent || "";
  const original = ORIGINAL_TEXT.get(textNode) || rewritten;

  button.addEventListener("click", () => {
    showingOriginal = !showingOriginal;
    textNode.textContent = showingOriginal ? original : rewritten;
    button.textContent = showingOriginal ? "Show rewritten" : "Show original";
  });

  parent.appendChild(button);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
