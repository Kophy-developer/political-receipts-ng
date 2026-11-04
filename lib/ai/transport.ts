import "server-only";
import { estimatedCostUsd, type ProviderPlan } from "@/lib/ai/catalog";
import { buildDiagnostic, editorMessage, type ProviderDiagnostic } from "@/lib/ai/diagnostics";
import { chatDraftBody, chatHealthBody, geminiBody, geminiEndpoint, groqChatEndpoint, openRouterChatEndpoint } from "@/lib/ai/payload";
import type { ProviderCallResult, ProviderRequest } from "@/lib/ai/route";

function timeoutError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError";
}

function headerRecord(response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
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

function failed(diagnostic: ProviderDiagnostic, usage: Pick<ProviderCallResult, "inputTokens" | "outputTokens" | "estimatedCostUsd">): ProviderCallResult {
  return { ok: false, failureReason: editorMessage(diagnostic), diagnostic, ...usage };
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

async function chat(
  plan: ProviderPlan,
  request: ProviderRequest,
  url: string,
  headers: Record<string, string>,
  maxTokens: number,
  temperature: number,
): Promise<ProviderCallResult> {
  const empty = { inputTokens: null, outputTokens: null, estimatedCostUsd: estimatedCostUsd(plan.id, plan.model) };
  const body = request.mode === "health"
    ? chatHealthBody(plan.model, request.userPrompt)
    : chatDraftBody({ model: plan.model, system: request.systemPrompt, user: request.userPrompt, schema: request.schema, temperature, maxTokens });
  let response: Response;
  try {
    response = await postJson(url, headers, body, request.timeoutMs);
  } catch (error) {
    return failed(buildDiagnostic({
      httpStatus: null,
      endpoint: url,
      model: plan.model,
      network: timeoutError(error) ? "timeout" : "network",
      message: timeoutError(error) ? "The request timed out." : "The network request failed.",
    }), empty);
  }
  const responseHeaders = headerRecord(response);
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      headers: responseHeaders,
      endpoint: url,
      model: plan.model,
      invalidResponse: response.ok,
      body: response.ok ? undefined : { error: { message: "The response was not JSON." } },
      message: response.ok ? "The response was not JSON." : undefined,
    }), empty);
  }
  const usage = chatUsage(parsed, plan.id, plan.model);
  const errorPresent = Boolean(parsed && typeof parsed === "object" && "error" in parsed && (parsed as { error?: unknown }).error);
  if (!response.ok || errorPresent) {
    return failed(buildDiagnostic({
      httpStatus: response.ok ? 400 : response.status,
      body: parsed,
      headers: responseHeaders,
      endpoint: url,
      model: plan.model,
    }), usage);
  }
  const content = (parsed as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
  const data = parseJsonObject(contentText(content));
  if (!data) {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      headers: responseHeaders,
      endpoint: url,
      model: plan.model,
      invalidResponse: true,
      message: "The response was not a JSON object.",
    }), usage);
  }
  return { ok: true, data, failureReason: null, diagnostic: null, ...usage };
}

async function gemini(plan: ProviderPlan, request: ProviderRequest, key: string, maxTokens: number, temperature: number): Promise<ProviderCallResult> {
  const endpoint = geminiEndpoint(plan.model);
  const empty = { inputTokens: null, outputTokens: null, estimatedCostUsd: null as number | null };
  const limit = request.mode === "health" ? 32 : maxTokens;
  const heat = request.mode === "health" ? 0 : temperature;
  let response: Response;
  try {
    response = await postJson(
      endpoint,
      { "content-type": "application/json", "x-goog-api-key": key },
      geminiBody({ system: request.systemPrompt, user: request.userPrompt, schema: request.schema, temperature: heat, maxTokens: limit }),
      request.timeoutMs,
    );
  } catch (error) {
    return failed(buildDiagnostic({
      httpStatus: null,
      endpoint,
      model: plan.model,
      network: timeoutError(error) ? "timeout" : "network",
      message: timeoutError(error) ? "The request timed out." : "The network request failed.",
    }), empty);
  }
  const responseHeaders = headerRecord(response);
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      headers: responseHeaders,
      endpoint,
      model: plan.model,
      invalidResponse: response.ok,
      message: response.ok ? "The response was not JSON." : "The response was not JSON.",
    }), empty);
  }
  const meta = (parsed as { usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown } } | null)?.usageMetadata;
  const usage = {
    inputTokens: tokenCount(meta?.promptTokenCount),
    outputTokens: tokenCount(meta?.candidatesTokenCount),
    estimatedCostUsd: null,
  };
  if (!response.ok) {
    return failed(buildDiagnostic({ httpStatus: response.status, body: parsed, headers: responseHeaders, endpoint, model: plan.model }), usage);
  }
  const text = (parsed as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null)?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? "";
  const data = parseJsonObject(text);
  if (!data) {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      headers: responseHeaders,
      endpoint,
      model: plan.model,
      invalidResponse: true,
      message: "The response was not a JSON object.",
    }), usage);
  }
  return { ok: true, data, failureReason: null, diagnostic: null, ...usage };
}

export async function callProvider(plan: ProviderPlan, request: ProviderRequest, limits?: { maxTokens?: number; temperature?: number }): Promise<ProviderCallResult> {
  const maxTokens = limits?.maxTokens ?? 2048;
  const temperature = limits?.temperature ?? 0.8;
  if (plan.id === "groq") {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) return { ok: false, failureReason: "no credential", diagnostic: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null };
    return chat(plan, request, groqChatEndpoint, { "content-type": "application/json", authorization: `Bearer ${key}` }, maxTokens, temperature);
  }
  if (plan.id === "openrouter") {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) return { ok: false, failureReason: "no credential", diagnostic: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null };
    return chat(plan, request, openRouterChatEndpoint, {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "http-referer": "https://political-receipts-ng.vercel.app",
      "x-title": "Political Receipts NG",
    }, maxTokens, temperature);
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, failureReason: "no credential", diagnostic: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null };
  return gemini(plan, request, key, maxTokens, temperature);
}
