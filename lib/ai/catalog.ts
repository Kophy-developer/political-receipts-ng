import type { DeskStatus } from "@/lib/ai/diagnostics";

/**
 * Provider catalogue for draft generation.
 * No credentials are read here. Callers pass an environment snapshot.
 *
 * Defaults:
 * - Groq `openai/gpt-oss-20b` is listed on Groq's published free-tier rate limits
 *   (about 30 requests per minute and 1,000 per day). Live `x-ratelimit-*` headers
 *   are shown exactly as returned. They are not copied into the desk allowance.
 *   This process does not call Groq to confirm the model is enabled on a key.
 * - OpenRouter `openrouter/free` is the provider's free router. It picks a
 *   free model per request and is not a stable extraction model. A specific
 *   `:free` model was not pinned, and no paid OpenRouter model is enabled.
 * - Gemini stays on the model already used for extraction.
 */

export const DRAFT_PROVIDER_ORDER = ["groq", "openrouter", "gemini"] as const;
export const EXTRACTION_PROVIDER_ORDER = ["groq", "openrouter", "gemini"] as const;

export type ProviderId = (typeof DRAFT_PROVIDER_ORDER)[number];

export type ProviderStatus = DeskStatus;

export const providerLabels: Record<ProviderId, string> = {
  groq: "Groq",
  openrouter: "OpenRouter",
  gemini: "Gemini",
};

export const defaultModels: Record<ProviderId, string> = {
  groq: "openai/gpt-oss-20b",
  openrouter: "openrouter/free",
  gemini: "gemini-3.8-flash",
};

/** Desk ceilings. Groq's published free tier is higher. OpenRouter's free-model day cap is 50 when the account has bought less than $10 of credits. */
export const defaultDaily: Record<ProviderId, number> = {
  groq: 40,
  openrouter: 50,
  gemini: 8,
};

/** Groq model ids published on the free-tier rate-limit list. Anything else is treated as paid capacity. */
export const freeGroqModels = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-safeguard-20b",
]);

export const EDITORIAL_REJECTION = "AI OUTPUT REJECTED BY EDITORIAL VALIDATOR";

export type SkipReason = "no credential" | "configured model is not usable" | "paid route blocked" | "daily allowance exhausted";

export type AiEnv = {
  groqKey: boolean;
  openrouterKey: boolean;
  geminiKey: boolean;
  groqModel: string | null;
  openrouterModel: string | null;
  geminiModel: string | null;
  groqModelInvalid: boolean;
  openrouterModelInvalid: boolean;
  geminiModelInvalid: boolean;
  paidUsage: boolean;
  daily: Record<ProviderId, number>;
};

export type ProviderPlan = {
  id: ProviderId;
  label: string;
  model: string;
  modelSource: "environment" | "default";
  callable: boolean;
  skipReason: SkipReason | null;
};

export type ProviderCard = {
  id: ProviderId;
  label: string;
  credential: boolean;
  model: string;
  modelNote: string;
  requestsToday: number;
  successfulRequests: number;
  failedRequests: number;
  latestResult: string | null;
  latestKind: "success" | "failure" | "none";
  earlierFailure: string | null;
  status: ProviderStatus;
  note: string | null;
  dailyAllowance: number;
  providerLimits: string | null;
  tokenAccount: string | null;
};

const modelPattern = /^[A-Za-z0-9._:/-]{1,120}$/;

export function configuredModel(raw: string | undefined | null) {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { value: null as string | null, invalid: false };
  if (!modelPattern.test(trimmed)) return { value: null as string | null, invalid: true };
  return { value: trimmed, invalid: false };
}

export function isFreeOpenRouter(model: string) {
  return model === "openrouter/free" || model.endsWith(":free");
}

export function isFreeGroq(model: string) {
  return freeGroqModels.has(model);
}

export function estimatedCostUsd(provider: ProviderId, model: string) {
  if (provider === "groq" && isFreeGroq(model)) return 0;
  if (provider === "openrouter" && isFreeOpenRouter(model)) return 0;
  return null;
}

function modelChoice(provider: ProviderId, configured: string | null, invalid: boolean) {
  if (invalid) return { model: configured ?? "", source: "environment" as const, invalid: true };
  if (configured) return { model: configured, source: "environment" as const, invalid: false };
  return { model: defaultModels[provider], source: "default" as const, invalid: false };
}

function paidBlocked(provider: ProviderId, model: string, paid: boolean) {
  if (paid) return false;
  if (provider === "groq") return !isFreeGroq(model);
  if (provider === "openrouter") return !isFreeOpenRouter(model);
  return false;
}

export function planProvider(provider: ProviderId, env: AiEnv, used: number): ProviderPlan {
  const configured = provider === "groq" ? env.groqModel : provider === "openrouter" ? env.openrouterModel : env.geminiModel;
  const invalid = provider === "groq" ? env.groqModelInvalid : provider === "openrouter" ? env.openrouterModelInvalid : env.geminiModelInvalid;
  const key = provider === "groq" ? env.groqKey : provider === "openrouter" ? env.openrouterKey : env.geminiKey;
  const choice = modelChoice(provider, configured, invalid);
  const limit = env.daily[provider];
  let skip: SkipReason | null = null;
  if (!key) skip = "no credential";
  else if (choice.invalid) skip = "configured model is not usable";
  else if (paidBlocked(provider, choice.model, env.paidUsage)) skip = "paid route blocked";
  else if (used >= limit) skip = "daily allowance exhausted";
  return {
    id: provider,
    label: providerLabels[provider],
    model: choice.invalid ? "Unusable model setting" : choice.model,
    modelSource: choice.source,
    callable: skip === null,
    skipReason: skip,
  };
}

export function providerOrder(raw: string | undefined, fallback: readonly ProviderId[]) {
  const allowed = new Set<string>(DRAFT_PROVIDER_ORDER);
  const parsed = (raw ?? "").split(",").map((item) => item.trim().toLowerCase()).filter((item): item is ProviderId => allowed.has(item));
  const unique = [...new Set(parsed)];
  return unique.length > 0 ? unique : [...fallback];
}

export function planDraftProviders(env: AiEnv, used: Record<ProviderId, number>) {
  return providerOrder(process.env.AI_DRAFT_PROVIDER_ORDER, DRAFT_PROVIDER_ORDER).map((provider) => planProvider(provider, env, used[provider] ?? 0));
}

export function planExtractionProviders(env: AiEnv, used: Record<ProviderId, number>) {
  return providerOrder(process.env.AI_EXTRACTION_PROVIDER_ORDER, EXTRACTION_PROVIDER_ORDER).map((provider) => planProvider(provider, env, used[provider] ?? 0));
}

export function modelNote(plan: ProviderPlan) {
  const live = "Availability was not checked with a live request.";
  if (plan.modelSource === "environment") return `Set by ${plan.id === "groq" ? "GROQ_MODEL" : plan.id === "openrouter" ? "OPENROUTER_MODEL" : "GEMINI_MODEL"}. ${live}`;
  if (plan.id === "groq") return `Default ${plan.model}, from Groq's published free-tier rate limits. ${live}`;
  if (plan.id === "openrouter") return `Default ${plan.model}, OpenRouter's free router. It is not switched onto a paid model. ${live}`;
  return `Default ${plan.model}, the extraction model already configured for this desk. ${live}`;
}
