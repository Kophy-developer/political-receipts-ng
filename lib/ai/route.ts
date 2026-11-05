import {
  estimatedCostUsd,
  type ProviderId,
  type ProviderPlan,
} from "@/lib/ai/catalog";
import { buildDiagnostic, editorMessage, sanitizeProviderMessage, type ProviderDiagnostic } from "@/lib/ai/diagnostics";

export type { ProviderPlan };

export type AcceptVerdict = "success" | "malformed" | "rejected";

export type ProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  evidence?: unknown;
  timeoutMs: number;
  mode: "health" | "generate";
};

export type ProviderCallResult = {
  ok: boolean;
  data?: unknown;
  failureReason: string | null;
  diagnostic: ProviderDiagnostic | null;
  inputTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
};

export type ProviderCaller = (plan: ProviderPlan, request: ProviderRequest) => Promise<ProviderCallResult>;

export type AttemptRecord = {
  provider: ProviderId;
  model: string;
  called: boolean;
  status: "success" | "failure" | "rejected";
  failureReason: string | null;
  diagnostic: ProviderDiagnostic | null;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
};

export type RouteResult = {
  ok: boolean;
  rejected: boolean;
  provider: ProviderId | null;
  model: string | null;
  data?: unknown;
  attempts: AttemptRecord[];
};

function stamp(ms: number) {
  return new Date(ms).toISOString();
}

/**
 * One editor action. Providers are tried in the order given.
 * A provider is called at most once. The first accepted result stops the chain.
 * A rejected verdict also stops the chain: wording is not shopped across providers.
 */
export async function generateStructuredContent(input: {
  task: string;
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  evidence?: unknown;
  timeoutMs: number;
  plans: ProviderPlan[];
  accept: (data: unknown) => AcceptVerdict;
  rejectionReason: string;
  now?: () => number;
  onStart?: (plan: ProviderPlan) => Promise<void> | void;
  onAttempt?: (attempt: AttemptRecord) => Promise<void> | void;
  call: ProviderCaller;
}): Promise<RouteResult> {
  if (!input.task) {
    return { ok: false, rejected: false, provider: null, model: null, attempts: [] };
  }
  const now = input.now ?? Date.now;
  const request: ProviderRequest = {
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    schema: input.schema,
    evidence: input.evidence,
    timeoutMs: input.timeoutMs,
    mode: input.task === "health" ? "health" : "generate",
  };
  const attempts: AttemptRecord[] = [];
  const seen = new Set<ProviderId>();
  const record = async (attempt: AttemptRecord) => {
    attempts.push(attempt);
    try {
      await input.onAttempt?.(attempt);
    } catch {
      // A progress write must not start another provider call.
    }
  };
  for (const plan of input.plans) {
    if (seen.has(plan.id)) continue;
    seen.add(plan.id);
    const started = now();
    if (!plan.callable) {
      const completed = now();
      await record({
        provider: plan.id,
        model: plan.model,
        called: false,
        status: "failure",
        failureReason: plan.skipReason,
        diagnostic: null,
        startedAt: stamp(started),
        completedAt: stamp(completed),
        latencyMs: Math.max(0, completed - started),
        inputTokens: null,
        reasoningTokens: null,
        outputTokens: null,
        totalTokens: null,
        estimatedCostUsd: null,
      });
      continue;
    }
    try {
      await input.onStart?.(plan);
    } catch {
      // A progress write must not start another provider call.
    }
    let raw: ProviderCallResult;
    try {
      raw = await input.call(plan, request);
    } catch {
      const diagnostic = buildDiagnostic({
        httpStatus: null,
        endpoint: "no response",
        model: plan.model,
        network: "network",
        message: "The provider call did not return a response.",
      });
      raw = {
        ok: false,
        failureReason: editorMessage(diagnostic),
        diagnostic,
        inputTokens: null,
        reasoningTokens: null,
        outputTokens: null,
        totalTokens: null,
        estimatedCostUsd: estimatedCostUsd(plan.id, plan.model),
      };
    }
    const completed = now();
    const base = {
      provider: plan.id,
      model: plan.model,
      called: true,
      startedAt: stamp(started),
      completedAt: stamp(completed),
      latencyMs: Math.max(0, completed - started),
      inputTokens: raw.inputTokens,
      reasoningTokens: raw.reasoningTokens,
      outputTokens: raw.outputTokens,
      totalTokens: raw.totalTokens,
      estimatedCostUsd: raw.estimatedCostUsd,
      diagnostic: raw.diagnostic,
    };
    if (!raw.ok || raw.data === undefined) {
      const diagnostic = raw.diagnostic ?? buildDiagnostic({
        httpStatus: null,
        endpoint: "no response",
        model: plan.model,
        message: raw.failureReason || "The provider did not return a usable response.",
      });
      await record({
        ...base,
        diagnostic,
        status: "failure",
        failureReason: raw.diagnostic ? editorMessage(raw.diagnostic) : sanitizeProviderMessage(raw.failureReason || editorMessage(diagnostic)),
      });
      continue;
    }
    const verdict = input.accept(raw.data);
    if (verdict === "malformed") {
      const diagnostic = buildDiagnostic({
        httpStatus: 200,
        endpoint: raw.diagnostic?.endpoint ?? "completed response",
        model: plan.model,
        invalidResponse: true,
        message: "The JSON did not match the requested shape.",
      });
      await record({ ...base, diagnostic, status: "failure", failureReason: editorMessage(diagnostic) });
      continue;
    }
    if (verdict === "rejected") {
      await record({ ...base, diagnostic: null, status: "rejected", failureReason: input.rejectionReason });
      return { ok: false, rejected: true, provider: plan.id, model: plan.model, data: raw.data, attempts };
    }
    await record({ ...base, diagnostic: null, status: "success", failureReason: null });
    return { ok: true, rejected: false, provider: plan.id, model: plan.model, data: raw.data, attempts };
  }
  return { ok: false, rejected: false, provider: null, model: null, attempts };
}
