import "server-only";

/** Fallback when GEMINI_MODEL is unset. Override it in the server environment. */
export const defaultGeminiModel = "gemini-3.8-flash";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiLabel() {
  return geminiConfigured() ? "Claim extraction" : "Not configured";
}

export function geminiModelName() {
  const raw = (process.env.GEMINI_MODEL?.trim() || defaultGeminiModel).replace(/^models\//, "");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(raw)) return defaultGeminiModel;
  return raw;
}
