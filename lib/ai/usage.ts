/**
 * Provider token accounting.
 * Reasoning tokens are not visible assistant content.
 * Groq reports them on usage.completion_tokens_details.reasoning_tokens.
 * usage_breakdown is the compound-request split and is only a fallback.
 * completion_tokens already includes reasoning tokens when Groq sends both.
 */

export type TokenAccount = {
  inputTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export const emptyTokenAccount: TokenAccount = {
  inputTokens: null,
  reasoningTokens: null,
  outputTokens: null,
  totalTokens: null,
};

function finiteInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function reasoningFromUsage(usage: unknown) {
  if (!usage || typeof usage !== "object") return null;
  const details = (usage as { completion_tokens_details?: { reasoning_tokens?: unknown } }).completion_tokens_details;
  return finiteInt(details?.reasoning_tokens);
}

export function readChatUsage(body: unknown): TokenAccount {
  const usage = body && typeof body === "object" ? (body as { usage?: unknown }).usage : null;
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  let reasoning = reasoningFromUsage(usage);
  if (reasoning == null && body && typeof body === "object") {
    const models = (body as { usage_breakdown?: { models?: unknown } }).usage_breakdown?.models;
    if (Array.isArray(models)) {
      let sum = 0;
      let seen = false;
      for (const model of models) {
        const modelUsage = model && typeof model === "object" ? (model as { usage?: unknown }).usage : null;
        const value = reasoningFromUsage(modelUsage);
        if (value != null) {
          sum += value;
          seen = true;
        }
      }
      if (seen) reasoning = sum;
    }
  }
  return {
    inputTokens: finiteInt(record.prompt_tokens),
    reasoningTokens: reasoning,
    outputTokens: finiteInt(record.completion_tokens),
    totalTokens: finiteInt(record.total_tokens),
  };
}

export function readGeminiUsage(body: unknown): TokenAccount {
  const meta = body && typeof body === "object" ? (body as { usageMetadata?: unknown }).usageMetadata : null;
  const record = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  return {
    inputTokens: finiteInt(record.promptTokenCount),
    reasoningTokens: finiteInt(record.thoughtsTokenCount),
    outputTokens: finiteInt(record.candidatesTokenCount),
    totalTokens: finiteInt(record.totalTokenCount),
  };
}

export function groqRequestId(body: unknown) {
  const id = body && typeof body === "object" ? (body as { x_groq?: { id?: unknown } }).x_groq?.id : null;
  return typeof id === "string" && id.trim() ? id.trim().slice(0, 80) : null;
}
