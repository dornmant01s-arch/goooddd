const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Comment Tone Rewriter installed.");
  console.log("Set your Gemini API key with: chrome.storage.local.set({ GEMINI_API_KEY: 'YOUR_KEY' })");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ANALYZE_AND_REWRITE") {
    return false;
  }

  analyzeAndRewrite(message.text)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      console.error("Gemini request failed", error);
      sendResponse({ ok: false, error: error.message || "Unknown error" });
    });

  return true;
});

async function analyzeAndRewrite(text) {
  if (!text || typeof text !== "string") {
    return { shouldRewrite: false, rewrittenText: null, reason: "Invalid text" };
  }

  const { GEMINI_API_KEY } = await chrome.storage.local.get(["GEMINI_API_KEY"]);
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in chrome.storage.local");
  }

  const prompt = [
    "You are a moderation assistant.",
    "Decide if the comment is negative or toxic.",
    "If it is negative or toxic, rewrite it to be neutral/positive while preserving core meaning.",
    "Return strict JSON only with keys:",
    '{"sentiment":"negative|neutral|positive","toxicity":"toxic|not_toxic","shouldRewrite":boolean,"rewrittenText":string}',
    "If shouldRewrite is false, rewrittenText must equal the original text.",
    "Comment:",
    text
  ].join("\n");

  const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Gemini response did not include text output");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const extracted = rawText.match(/\{[\s\S]*\}/);
    if (!extracted) {
      throw new Error("Failed to parse Gemini JSON output");
    }
    parsed = JSON.parse(extracted[0]);
  }

  const shouldRewrite = Boolean(parsed.shouldRewrite);
  const rewrittenText = typeof parsed.rewrittenText === "string" ? parsed.rewrittenText.trim() : text;

  return {
    sentiment: parsed.sentiment || "unknown",
    toxicity: parsed.toxicity || "unknown",
    shouldRewrite,
    rewrittenText: shouldRewrite ? rewrittenText : text
  };
}
