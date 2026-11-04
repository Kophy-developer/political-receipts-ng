import {
  estimatedCostUsd,
  scrubProviderText,
  type ProviderId,
  type ProviderPlan,
} from "@/lib/ai/catalog";

export type { ProviderPlan };

export type AcceptVerdict = "success" | "malformed" | "rejected";

export type ProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  evidence?: unknown;
  timeoutMs: number;
};

export type ProviderCallResult = {
  ok: boolean;
  data?: unknown;
  failureReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

export type ProviderCaller = (plan: ProviderPlan, request: ProviderRequest) => Promise<ProviderCallResult>;

export type AttemptRecord = {
  provider: ProviderId;
  model: string;
  called: boolean;
  status: "success" | "failure" | "rejected";
  failureReason: string | null;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
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
  };
  const attempts: AttemptRecord[] = [];
  const seen = new Set<ProviderId>();
  for (const plan of input.plans) {
    if (seen.has(plan.id)) continue;
    seen.add(plan.id);
    const started = now();
    if (!plan.callable) {
      const completed = now();
      attempts.push({
        provider: plan.id,
        model: plan.model,
        called: false,
        status: "failure",
        failureReason: plan.skipReason,
        startedAt: stamp(started),
        completedAt: stamp(completed),
        latencyMs: Math.max(0, completed - started),
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
      });
      continue;
    }
    let raw: ProviderCallResult;
    try {
      raw = await input.call(plan, request);
    } catch {
      raw = {
        ok: false,
        failureReason: "unavailable",
        inputTokens: null,
        outputTokens: null,
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
      outputTokens: raw.outputTokens,
      estimatedCostUsd: raw.estimatedCostUsd,
    };
    if (!raw.ok || raw.data === undefined) {
      attempts.push({
        ...base,
        status: "failure",
        failureReason: scrubProviderText(raw.failureReason || "unavailable"),
      });
      continue;
    }
    const verdict = input.accept(raw.data);
    if (verdict === "malformed") {
      attempts.push({ ...base, status: "failure", failureReason: "malformed output" });
      continue;
    }
    if (verdict === "rejected") {
      attempts.push({ ...base, status: "rejected", failureReason: input.rejectionReason });
      return { ok: false, rejected: true, provider: plan.id, model: plan.model, data: raw.data, attempts };
    }
    attempts.push({ ...base, status: "success", failureReason: null });
    return { ok: true, rejected: false, provider: plan.id, model: plan.model, data: raw.data, attempts };
  }
  return { ok: false, rejected: false, provider: null, model: null, attempts };
}
