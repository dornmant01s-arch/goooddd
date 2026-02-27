const GEMINI_MODEL = "gemini-pro";
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
  const { GEMINI_API_KEY } = await chrome.storage.local.get(["GEMINI_API_KEY"]);
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in chrome.storage.local");
  }

  const result = await callGeminiToxicRewrite(text, GEMINI_API_KEY);

  return {
    isToxic: result.isToxic,
    shouldRewrite: result.isToxic,
    rewrittenText: result.rewrittenText
  };
}

async function callGeminiToxicRewrite(text, apiKey) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Input text must be a non-empty string.");
  }

  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("A valid Gemini API key is required.");
  }

  const prompt = [
    "You are a content moderation assistant.",
    "Task:",
    "1) Detect if the input text is toxic or highly negative.",
    "2) If toxic, rewrite it in a neutral tone.",
    "3) Respond with JSON only using exactly this schema:",
    '{"isToxic": true/false, "rewrittenText": "string"}',
    "Rules:",
    "- If isToxic is false, rewrittenText must equal the original input text.",
    "- Do not include markdown, comments, or extra keys.",
    "Input text:",
    text
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

  const isToxic = Boolean(parsed?.isToxic);
  const rewrittenText = typeof parsed?.rewrittenText === "string" && parsed.rewrittenText.trim()
    ? parsed.rewrittenText.trim()
    : text;

  return {
    isToxic,
    rewrittenText: isToxic ? rewrittenText : text
  };
}
