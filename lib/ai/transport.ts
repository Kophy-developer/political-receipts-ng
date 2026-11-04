import "server-only";
import { estimatedCostUsd, type ProviderPlan } from "@/lib/ai/catalog";
import { buildDiagnostic, editorMessage, type ProviderDiagnostic } from "@/lib/ai/diagnostics";
import { chatDraftBody, chatHealthBody, geminiBody, geminiEndpoint, groqChatEndpoint, openRouterChatEndpoint } from "@/lib/ai/payload";
import type { ProviderCallResult, ProviderRequest } from "@/lib/ai/route";
import { readOutputBudgets } from "@/lib/ai/budgets";
import { judgeGenerated, readChatGenerated, readGeminiGenerated, responseShape } from "@/lib/ai/structured";
import { emptyTokenAccount, groqRequestId, readChatUsage, readGeminiUsage, type TokenAccount } from "@/lib/ai/usage";

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

function withCost(account: TokenAccount, body: unknown, provider: ProviderPlan["id"], model: string) {
  const reported = body && typeof body === "object" ? (body as { usage?: { cost?: unknown } }).usage?.cost : null;
  return {
    ...account,
    estimatedCostUsd: typeof reported === "number" && Number.isFinite(reported) ? reported : estimatedCostUsd(provider, model),
  };
}

function failed(diagnostic: ProviderDiagnostic, usage: Pick<ProviderCallResult, "inputTokens" | "reasoningTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd">): ProviderCallResult {
  return { ok: false, failureReason: editorMessage(diagnostic), diagnostic, ...usage };
}

function tokenFields(account: TokenAccount) {
  return {
    input: account.inputTokens,
    reasoning: account.reasoningTokens,
    output: account.outputTokens,
    total: account.totalTokens,
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

async function chat(
  plan: ProviderPlan,
  request: ProviderRequest,
  url: string,
  headers: Record<string, string>,
  maxTokens: number,
  temperature: number,
): Promise<ProviderCallResult> {
  const empty = { ...emptyTokenAccount, estimatedCostUsd: estimatedCostUsd(plan.id, plan.model) };
  const body = request.mode === "health"
    ? chatHealthBody(plan.model, request.userPrompt, maxTokens)
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
  const usage = withCost(readChatUsage(parsed), parsed, plan.id, plan.model);
  const errorPresent = Boolean(parsed && typeof parsed === "object" && "error" in parsed && (parsed as { error?: unknown }).error);
  if (!response.ok || errorPresent) {
    return failed(buildDiagnostic({
      httpStatus: response.ok ? 400 : response.status,
      body: parsed,
      headers: responseHeaders,
      endpoint: url,
      model: plan.model,
      requestId: groqRequestId(parsed),
      tokens: tokenFields(usage),
    }), usage);
  }
  const generated = readChatGenerated(parsed);
  const judged = judgeGenerated(request.mode, generated);
  if (judged !== "ok") {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      headers: responseHeaders,
      endpoint: url,
      model: plan.model,
      requestId: groqRequestId(parsed),
      outputLimited: judged === "output_limit",
      invalidResponse: judged !== "output_limit",
      shape: responseShape(generated),
      tokens: tokenFields(usage),
      message: judged === "output_limit"
        ? generated.contentLength === 0
          ? "The output budget was used up before the assistant returned any content."
          : "The output budget cut the assistant off. Truncated structured output was not accepted."
        : judged === "not_ok"
          ? "The assistant JSON did not contain ok: true."
          : "The assistant content was not a JSON object.",
    }), usage);
  }
  return { ok: true, data: generated.data, failureReason: null, diagnostic: null, ...usage };
}

async function gemini(plan: ProviderPlan, request: ProviderRequest, key: string, maxTokens: number, temperature: number): Promise<ProviderCallResult> {
  const endpoint = geminiEndpoint(plan.model);
  const empty = { ...emptyTokenAccount, estimatedCostUsd: null as number | null };
  const limit = maxTokens;
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
  const usage = { ...readGeminiUsage(parsed), estimatedCostUsd: null };
  if (!response.ok) {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      body: parsed,
      headers: responseHeaders,
      endpoint,
      model: plan.model,
      tokens: tokenFields(usage),
    }), usage);
  }
  const generated = readGeminiGenerated(parsed);
  const judged = judgeGenerated(request.mode, generated);
  if (judged !== "ok") {
    return failed(buildDiagnostic({
      httpStatus: response.status,
      headers: responseHeaders,
      endpoint,
      model: plan.model,
      outputLimited: judged === "output_limit",
      invalidResponse: judged !== "output_limit",
      shape: responseShape(generated),
      tokens: tokenFields(usage),
      message: judged === "output_limit"
        ? generated.contentLength === 0
          ? "The output budget was used up before the assistant returned any content."
          : "The output budget cut the assistant off. Truncated structured output was not accepted."
        : judged === "not_ok"
          ? "The assistant JSON did not contain ok: true."
          : "The assistant content was not a JSON object.",
    }), usage);
  }
  return { ok: true, data: generated.data, failureReason: null, diagnostic: null, ...usage };
}

export async function callProvider(plan: ProviderPlan, request: ProviderRequest, limits?: { maxTokens?: number; temperature?: number }): Promise<ProviderCallResult> {
  const budgets = readOutputBudgets();
  const maxTokens = limits?.maxTokens ?? (request.mode === "health" ? budgets.health : budgets.draft);
  const temperature = limits?.temperature ?? 0.8;
  const missing = { ok: false as const, failureReason: "no credential", diagnostic: null, ...emptyTokenAccount, estimatedCostUsd: null };
  if (plan.id === "groq") {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) return missing;
    return chat(plan, request, groqChatEndpoint, { "content-type": "application/json", authorization: `Bearer ${key}` }, maxTokens, temperature);
  }
  if (plan.id === "openrouter") {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) return missing;
    return chat(plan, request, openRouterChatEndpoint, {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "http-referer": "https://political-receipts-ng.vercel.app",
      "x-title": "Political Receipts NG",
    }, maxTokens, temperature);
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return missing;
  return gemini(plan, request, key, maxTokens, temperature);
}
