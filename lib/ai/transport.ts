import "server-only";
import { estimatedCostUsd, type ProviderPlan } from "@/lib/ai/catalog";
import type { ProviderCallResult, ProviderRequest } from "@/lib/ai/route";

function timeoutError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError";
}

function reasonForStatus(status: number) {
  if (status === 429) return "rate limited";
  if (status === 408 || status === 504) return "timed out";
  return "unavailable";
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
}

function tokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function chatUsage(body: unknown, provider: ProviderPlan["id"], model: string) {
  const usage = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown } } | null)?.usage;
  const reported = usage?.cost;
  return {
    inputTokens: tokenCount(usage?.prompt_tokens),
    outputTokens: tokenCount(usage?.completion_tokens),
    estimatedCostUsd: typeof reported === "number" && Number.isFinite(reported) ? reported : estimatedCostUsd(provider, model),
  };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function chat(plan: ProviderPlan, request: ProviderRequest, url: string, headers: Record<string, string>, maxTokens: number, temperature: number): Promise<ProviderCallResult> {
  let response: Response;
  try {
    response = await postJson(
      url,
      headers,
      {
        model: plan.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: `${request.systemPrompt}\n\nReturn one JSON object and nothing else. Match this schema: ${JSON.stringify(request.schema)}`,
          },
          { role: "user", content: request.userPrompt },
        ],
        response_format: { type: "json_object" },
      },
      request.timeoutMs,
    );
  } catch (error) {
    return {
      ok: false,
      failureReason: timeoutError(error) ? "timed out" : "unavailable",
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: estimatedCostUsd(plan.id, plan.model),
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      failureReason: response.ok ? "malformed output" : reasonForStatus(response.status),
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: estimatedCostUsd(plan.id, plan.model),
    };
  }
  const usage = chatUsage(body, plan.id, plan.model);
  if (!response.ok || (body && typeof body === "object" && "error" in body && (body as { error?: unknown }).error)) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    const reason = typeof code === "number" && code === 429 ? "rate limited" : reasonForStatus(response.status);
    return { ok: false, failureReason: response.ok ? "unavailable" : reason, ...usage };
  }
  const content = (body as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
  const data = parseJsonObject(contentText(content));
  if (!data) return { ok: false, failureReason: "malformed output", ...usage };
  return { ok: true, data, failureReason: null, ...usage };
}

async function gemini(plan: ProviderPlan, request: ProviderRequest, key: string, maxTokens: number, temperature: number): Promise<ProviderCallResult> {
  let response: Response;
  try {
    response = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(plan.model)}:generateContent`,
      { "content-type": "application/json", "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          responseSchema: request.schema,
        },
      },
      request.timeoutMs,
    );
  } catch (error) {
    return {
      ok: false,
      failureReason: timeoutError(error) ? "timed out" : "unavailable",
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failureReason: response.ok ? "malformed output" : reasonForStatus(response.status), inputTokens: null, outputTokens: null, estimatedCostUsd: null };
  }
  const meta = (body as { usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown } } | null)?.usageMetadata;
  const usage = {
    inputTokens: tokenCount(meta?.promptTokenCount),
    outputTokens: tokenCount(meta?.candidatesTokenCount),
    estimatedCostUsd: null,
  };
  if (!response.ok) return { ok: false, failureReason: reasonForStatus(response.status), ...usage };
  const text = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null)?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? "";
  const data = parseJsonObject(text);
  if (!data) return { ok: false, failureReason: "malformed output", ...usage };
  return { ok: true, data, failureReason: null, ...usage };
}

export async function callProvider(plan: ProviderPlan, request: ProviderRequest, limits?: { maxTokens?: number; temperature?: number }): Promise<ProviderCallResult> {
  const maxTokens = limits?.maxTokens ?? 2048;
  const temperature = limits?.temperature ?? 0.8;
  if (plan.id === "groq") {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) return { ok: false, failureReason: "no credential", inputTokens: null, outputTokens: null, estimatedCostUsd: null };
    return chat(plan, request, "https://api.groq.com/openai/v1/chat/completions", {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    }, maxTokens, temperature);
  }
  if (plan.id === "openrouter") {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) return { ok: false, failureReason: "no credential", inputTokens: null, outputTokens: null, estimatedCostUsd: null };
    return chat(plan, request, "https://openrouter.ai/api/v1/chat/completions", {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "http-referer": "https://political-receipts-ng.vercel.app",
      "x-title": "Political Receipts NG",
    }, maxTokens, temperature);
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, failureReason: "no credential", inputTokens: null, outputTokens: null, estimatedCostUsd: null };
  return gemini(plan, request, key, maxTokens, temperature);
}
