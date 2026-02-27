const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com";
const API_VERSIONS = ["v1beta", "v1"];
const MODEL_CANDIDATES = [
  DEFAULT_MODEL,
  "gemini-2.5-flash-latest",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash"
];
const CACHE_LIMIT = 100;
const rewriteCache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "REWRITE_SELECTION") {
    return false;
  }

  rewriteSelection(message.text)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || "Unknown error" });
    });

  return true;
});

async function rewriteSelection(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("Please select some text.");
  }

  if (rewriteCache.has(normalized)) {
    const cached = rewriteCache.get(normalized);
    rewriteCache.delete(normalized);
    rewriteCache.set(normalized, cached);
    return cached;
  }

  const { GEMINI_API_KEY, GEMINI_MODEL } = await chrome.storage.local.get(["GEMINI_API_KEY", "GEMINI_MODEL"]);
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in chrome.storage.local");
  }

  const preferredModel = normalizeText(GEMINI_MODEL) || DEFAULT_MODEL;
  const rewrittenText = await callGeminiRewriteWithFallback(normalized, GEMINI_API_KEY, preferredModel);

  const result = { rewrittenText };
  rewriteCache.set(normalized, result);

  if (rewriteCache.size > CACHE_LIMIT) {
    const oldestKey = rewriteCache.keys().next().value;
    rewriteCache.delete(oldestKey);
  }

  return result;
}

async function callGeminiRewriteWithFallback(text, apiKey, preferredModel) {
  const candidates = [preferredModel, ...MODEL_CANDIDATES.filter((m) => m !== preferredModel)];
  let lastError = null;

  for (const version of API_VERSIONS) {
    for (const model of candidates) {
      try {
        return await callGeminiRewrite(text, apiKey, { model, version });
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error)) {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error("No supported Gemini model endpoint available.");
}

function isRetryableModelError(error) {
  const message = String(error?.message || "");
  return /request failed \(404\)/i.test(message) || /NOT_FOUND/i.test(message) || /models\//i.test(message);
}

async function callGeminiRewrite(text, apiKey, target) {
  const prompt = [
    "You are a Korean tone-rewrite assistant.",
    "Perform this in ONE call with two internal steps:",
    "Step 1 (silent): identify tone issues (sarcasm, irony, passive-aggressive phrasing, backhanded compliments, insinuations), profanity, insults, and slang; then choose rewrite strategy.",
    "Step 2 (output): produce only the final rewritten sentence/text.",
    "",
    "Rewrite goals:",
    "- Neutralize sarcasm, irony, passive-aggressive nuance, backhanded compliments, and insinuations.",
    "- Remove profanity, insults, and slang.",
    "- Preserve original meaning and intent.",
    "- Rewrite in natural Korean conversational tone: polite, warm, refined, and sophisticated.",
    "- Avoid formal bureaucratic/corporate style (e.g., do not use expressions like '~하시기 바랍니다').",
    "- Avoid overly casual slang tone.",
    "- Keep output length close to original (about ±20%).",
    "- Preserve punctuation and emojis when appropriate.",
    "- Do not add new information.",
    "- Do not moralize, lecture, or explain.",
    "",
    "Output rules:",
    "- Return ONLY rewritten text.",
    "- No quotes, no markdown, no code fences, no extra commentary.",
    "",
    "Input text:",
    text
  ].join("\n");

  const url = `${API_BASE}/${target.version}/models/${target.model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          topP: 0.92,
          responseMimeType: "text/plain"
        }
      })
    });
  } catch (error) {
    throw new Error(`Network error while calling Gemini API: ${error.message}`);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "Unable to read error body");
    throw new Error(`Gemini API request failed (${response.status}): ${details}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse Gemini API response JSON: ${error.message}`);
  }

  const candidateText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    throw new Error("Gemini API response did not include model output text.");
  }

  const rewrittenText = normalizeModelOutput(candidateText);
  if (!rewrittenText) {
    throw new Error("Gemini did not return rewritten text.");
  }

  return rewrittenText;
}

function normalizeModelOutput(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/```$/g, "")
    .replace(/^(["'“”‘’])|(["'“”‘’])$/g, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
