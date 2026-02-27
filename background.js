const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
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

  const { GEMINI_API_KEY } = await chrome.storage.local.get(["GEMINI_API_KEY"]);
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in chrome.storage.local");
  }

  const rewrittenText = await callGeminiRewrite(normalized, GEMINI_API_KEY);
  const result = { rewrittenText };
  rewriteCache.set(normalized, result);

  if (rewriteCache.size > CACHE_LIMIT) {
    const oldestKey = rewriteCache.keys().next().value;
    rewriteCache.delete(oldestKey);
  }

  return result;
}

async function callGeminiRewrite(text, apiKey) {
  const prompt = [
    "You are a text tone rewriting assistant.",
    "Rewrite the input text into a calm, neutral, or positive tone.",
    "Keep the original meaning.",
    "Return JSON only with exactly this schema:",
    '{"rewrittenText": "string"}',
    "",
    "Input:",
    `"${text}"`
  ].join("\n");

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
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

  let parsed;
  try {
    parsed = JSON.parse(candidateText);
  } catch {
    const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini output was not valid JSON.");
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  const rewrittenText = normalizeText(parsed?.rewrittenText);
  if (!rewrittenText) {
    throw new Error("Gemini did not return rewrittenText.");
  }

  return rewrittenText;
}

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
