// Shared multi-provider AI text generation. Tries each configured provider
// in order and falls through to the next on missing key, HTTP error, or
// empty response - callers get a single generateAiText() call and never
// need to know which provider actually answered.

type Provider = "gemini" | "openai" | "openrouter";

async function callGemini(prompt: string, apiKey: string, maxTokens: number): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callOpenAI(prompt: string, apiKey: string, maxTokens: number): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callOpenRouter(prompt: string, apiKey: string, maxTokens: number): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

const PROVIDERS: { name: Provider; key: () => string | undefined; call: (prompt: string, apiKey: string, maxTokens: number) => Promise<string | null> }[] = [
  { name: "gemini", key: () => process.env.GEMINI_API_KEY, call: callGemini },
  { name: "openai", key: () => process.env.OPENAI_API_KEY, call: callOpenAI },
  { name: "openrouter", key: () => process.env.OPENROUTER_API_KEY, call: callOpenRouter },
];

/**
 * Generate text from the first configured, working AI provider.
 * Tries gemini -> openai -> openrouter in order; returns null (not a throw)
 * if every configured provider fails or none are configured, so callers can
 * fall back to their own rule-based logic. maxTokens defaults to 600 (plenty
 * for a one-line script/note); pass more for structured/JSON output that
 * needs room to complete without truncating mid-response.
 *
 * 1200, not a smaller "a sentence is short" number: some models (observed
 * on gemini-3.6-flash) spend part of the token budget on invisible internal
 * reasoning before ever emitting visible output, so even a 40-word reply
 * can get cut off well before 40 words' worth of tokens.
 */
export async function generateAiText(prompt: string, maxTokens = 1200): Promise<{ text: string; provider: Provider } | null> {
  for (const p of PROVIDERS) {
    const apiKey = p.key();
    if (!apiKey) continue;
    try {
      const text = await p.call(prompt, apiKey, maxTokens);
      if (text && text.trim()) {
        return { text: text.trim().replace(/^["']|["']$/g, ""), provider: p.name };
      }
    } catch (err) {
      console.error(`AI provider "${p.name}" failed, trying next:`, err);
    }
  }
  return null;
}
