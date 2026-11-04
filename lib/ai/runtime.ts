import "server-only";
import { configuredModel, defaultDaily, type AiEnv, type ProviderId } from "@/lib/ai/catalog";
import { scanLimits } from "@/lib/intel/limits";

function positiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) return fallback;
  return parsed;
}

export function readAiEnv(): AiEnv {
  const groq = configuredModel(process.env.GROQ_MODEL);
  const openrouter = configuredModel(process.env.OPENROUTER_MODEL);
  const gemini = configuredModel(process.env.GEMINI_MODEL);
  return {
    groqKey: Boolean(process.env.GROQ_API_KEY?.trim()),
    openrouterKey: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    geminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    groqModel: groq.value,
    openrouterModel: openrouter.value,
    geminiModel: gemini.value,
    groqModelInvalid: groq.invalid,
    openrouterModelInvalid: openrouter.invalid,
    geminiModelInvalid: gemini.invalid,
    paidUsage: process.env.AI_PAID_USAGE_ENABLED === "true",
    daily: {
      groq: positiveInt(process.env.GROQ_DAILY_REQUESTS, defaultDaily.groq),
      openrouter: positiveInt(process.env.OPENROUTER_DAILY_REQUESTS, defaultDaily.openrouter),
      gemini: scanLimits.dailyGeminiRequests,
    },
  };
}

export function credentialPresent(provider: ProviderId, env: AiEnv) {
  if (provider === "groq") return env.groqKey;
  if (provider === "openrouter") return env.openrouterKey;
  return env.geminiKey;
}
