import "server-only";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiLabel() {
  return geminiConfigured() ? "Claim extraction" : "Not configured";
}

export function geminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}
