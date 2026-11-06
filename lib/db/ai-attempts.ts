import "server-only";
import {
  modelNote,
  planDraftProviders,
  type ProviderCard,
  type ProviderId,
} from "@/lib/ai/catalog";
import { providerReadout, retainedFailure, shownProviderStatus, type ProviderDiagnostic } from "@/lib/ai/diagnostics";
import { credentialPresent, readAiEnv } from "@/lib/ai/runtime";
import { columnMissing, schemaMissing, serviceClient } from "@/lib/db/client";
import type { StampedAttempt } from "@/lib/drafts/chain";
import { readDiagnosticTrace, type EditorialTrace, type UnderstandTrace } from "@/lib/editorial/trace";
import { lagosDayStart } from "@/lib/intel/limits";
import { usageSince } from "@/lib/db/usage";

type AttemptRow = {
  provider: ProviderId;
  status: "success" | "failure" | "rejected";
  called: boolean;
  task: string;
  failure_reason: string | null;
  diagnostic: ProviderDiagnostic | null;
  completed_at: string;
  input_tokens: number | null;
  reasoning_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
};

function emptyCounts(): Record<ProviderId, number> {
  return { groq: 0, openrouter: 0, gemini: 0 };
}

export async function persistAttempts(rows: StampedAttempt[]) {
  const db = serviceClient();
  if (!db || rows.length === 0) return { ok: false as const };
  const payload = rows.map((row) => ({
    request_id: row.requestId,
    task: row.task,
    provider: row.provider,
    model: row.model.slice(0, 120),
    status: row.status,
    called: row.called,
    failure_reason: row.failureReason,
    diagnostic: row.diagnostic,
    input_tokens: row.inputTokens,
    reasoning_tokens: row.reasoningTokens,
    output_tokens: row.outputTokens,
    total_tokens: row.totalTokens,
    estimated_cost_usd: row.estimatedCostUsd,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    latency_ms: row.latencyMs,
    response: row.response ?? null,
  }));
  const { error } = await db.from("ai_attempts").insert(payload);
  if (error && columnMissing(error.message)) {
    const plain = payload.map((row) => {
      const { response, ...rest } = row;
      void response;
      return rest;
    });
    const retry = await db.from("ai_attempts").insert(plain);
    return { ok: !retry.error };
  }
  return { ok: !error };
}

async function rowsSince(startIso: string) {
  const db = serviceClient();
  if (!db) return { rows: [] as AttemptRow[], blocked: false };
  const selected = await db
    .from("ai_attempts")
    .select("provider, task, status, called, failure_reason, diagnostic, completed_at, input_tokens, reasoning_tokens, output_tokens, total_tokens")
    .gte("completed_at", startIso)
    .order("completed_at", { ascending: false });
  if (selected.error && columnMissing(selected.error.message)) {
    const plain = await db
      .from("ai_attempts")
      .select("provider, task, status, called, failure_reason, diagnostic, completed_at, input_tokens, output_tokens")
      .gte("completed_at", startIso)
      .order("completed_at", { ascending: false });
    if (plain.error && columnMissing(plain.error.message)) {
      const older = await db
        .from("ai_attempts")
        .select("provider, task, status, called, failure_reason, completed_at")
        .gte("completed_at", startIso)
        .order("completed_at", { ascending: false });
      if (older.error) return { rows: [] as AttemptRow[], blocked: !schemaMissing(older.error.message) };
      return {
        rows: ((older.data ?? []) as Array<Pick<AttemptRow, "provider" | "task" | "status" | "called" | "failure_reason" | "completed_at">>).map((row) => ({
          ...row,
          diagnostic: null,
          input_tokens: null,
          reasoning_tokens: null,
          output_tokens: null,
          total_tokens: null,
        })),
        blocked: false,
      };
    }
    if (plain.error) return { rows: [] as AttemptRow[], blocked: !schemaMissing(plain.error.message) };
    return {
      rows: ((plain.data ?? []) as Array<Omit<AttemptRow, "reasoning_tokens" | "total_tokens">>).map((row) => ({
        ...row,
        reasoning_tokens: null,
        total_tokens: null,
      })),
      blocked: false,
    };
  }
  if (selected.error) return { rows: [] as AttemptRow[], blocked: !schemaMissing(selected.error.message) };
  return { rows: (selected.data ?? []) as AttemptRow[], blocked: false };
}

function shownCount(value: number | null) {
  return value == null ? "not reported" : String(value);
}

function tokenAccount(row: AttemptRow | null) {
  if (!row) return null;
  if ([row.input_tokens, row.reasoning_tokens, row.output_tokens, row.total_tokens].every((value) => value == null)) return null;
  return `Prompt ${shownCount(row.input_tokens)}. Reasoning ${shownCount(row.reasoning_tokens)}. Completion ${shownCount(row.output_tokens)}. Total ${shownCount(row.total_tokens)}. Reasoning tokens are not visible assistant content. On Groq, completion tokens already include reasoning tokens.`;
}

export async function providerBoard(): Promise<{ paidUsage: boolean; providers: ProviderCard[] }> {
  const env = readAiEnv();
  const usage = await usageSince(lagosDayStart());
  const loaded = await rowsSince(lagosDayStart());
  const called = emptyCounts();
  const successful = emptyCounts();
  const failed = emptyCounts();
  const lastSkip: Record<ProviderId, string | null> = { groq: null, openrouter: null, gemini: null };
  const latestCalled: Record<ProviderId, AttemptRow | null> = { groq: null, openrouter: null, gemini: null };
  const earlierFailure: Record<ProviderId, string | null> = { groq: null, openrouter: null, gemini: null };
  const providerLimits: Record<ProviderId, string | null> = { groq: null, openrouter: null, gemini: null };
  const lostOriginal: Record<ProviderId, boolean> = { groq: false, openrouter: false, gemini: false };
  for (const row of loaded.rows) {
    if (row.called && !providerLimits[row.provider] && row.diagnostic?.rateLimit) {
      providerLimits[row.provider] = Object.entries(row.diagnostic.rateLimit).map(([key, value]) => `${key}=${value}`).join(", ");
    }
    if (!row.called) {
      if (!lastSkip[row.provider] && row.failure_reason) lastSkip[row.provider] = row.failure_reason;
      continue;
    }
    const latest = latestCalled[row.provider];
    if (!latest) latestCalled[row.provider] = row;
    else if ((latest.status === "success" || latest.status === "rejected") && row.status === "failure" && !earlierFailure[row.provider]) {
      const retained = retainedFailure(row.failure_reason, row.diagnostic);
      earlierFailure[row.provider] = retained?.text ?? row.failure_reason;
    }
    called[row.provider] += 1;
    if (row.status === "success") successful[row.provider] += 1;
    else failed[row.provider] += 1;
    if (row.status === "failure" && row.failure_reason === "unavailable" && !latest) lostOriginal[row.provider] = true;
  }
  const usageUnreadable = !usage.ok;
  const historical = usage.ok ? usage.totals.geminiRequests : env.daily.gemini;
  const used: Record<ProviderId, number> = {
    groq: loaded.blocked ? env.daily.groq : called.groq,
    openrouter: loaded.blocked ? env.daily.openrouter : called.openrouter,
    gemini: (loaded.blocked ? env.daily.gemini : called.gemini) + historical,
  };
  const plans = planDraftProviders(env, used);
  return {
    paidUsage: env.paidUsage,
    providers: plans.map((plan) => {
      const requestsToday = used[plan.id];
      const latest = latestCalled[plan.id];
      const readout = providerReadout({
        latest: latest
          ? {
              status: latest.status,
              task: latest.task,
              completedAt: latest.completed_at,
              reason: latest.status === "failure" ? (retainedFailure(latest.failure_reason, latest.diagnostic)?.text ?? latest.failure_reason) : null,
            }
          : null,
        earlierFailure: earlierFailure[plan.id],
      });
      const checked = Boolean(latest);
      const succeeded = latest?.status === "success" || latest?.status === "rejected";
      const baseNote = modelNote(plan);
      const liveNote = !checked
        ? baseNote
        : succeeded
          ? baseNote.replace("Availability was not checked with a live request.", "A live request succeeded.")
          : baseNote.replace("Availability was not checked with a live request.", "A live request was made and did not establish availability.");
      const note = plan.skipReason === "paid route blocked"
        ? "This model is not a free route. It is skipped while AI paid usage is off."
        : lostOriginal[plan.id]
          ? "Original provider error was not retained."
          : plan.id === "gemini" && usageUnreadable
            ? "The earlier Gemini log could not be read, so Gemini is held until it can be."
            : plan.id === "gemini" && historical > 0
              ? `Earlier Gemini log: ${historical} request${historical === 1 ? "" : "s"}. That log was not rewritten and does not split success from failure.`
              : null;
      return {
        id: plan.id,
        label: plan.label,
        credential: credentialPresent(plan.id, env),
        model: plan.model,
        modelNote: liveNote,
        requestsToday,
        successfulRequests: successful[plan.id],
        failedRequests: failed[plan.id],
        latestResult: readout.latestResult ?? lastSkip[plan.id],
        latestKind: readout.latestKind,
        earlierFailure: readout.earlierFailure,
        status: shownProviderStatus({
          credential: credentialPresent(plan.id, env),
          callable: plan.callable,
          skipReason: plan.skipReason,
          used: used[plan.id],
          limit: env.daily[plan.id],
          latest: latest
            ? { status: latest.status, reason: latest.failure_reason, diagnostic: latest.diagnostic }
            : null,
        }),
        note,
        dailyAllowance: env.daily[plan.id],
        providerLimits: providerLimits[plan.id],
        tokenAccount: tokenAccount(latest),
      };
    }),
  };
}

export type EditorialHistoryItem = (EditorialTrace | UnderstandTrace) & { completedAt: string };

/** Successful readings for settings. Historical assessments stay. The desk does not call this. */
export async function editorialAssessmentHistory(limit = 5): Promise<EditorialHistoryItem[]> {
  const db = serviceClient();
  if (!db) return [];
  const selected = await db
    .from("ai_attempts")
    .select("provider, model, request_id, completed_at, input_tokens, reasoning_tokens, output_tokens, response")
    .in("task", ["editorial", "understand"])
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (selected.error) return [];
  const items: EditorialHistoryItem[] = [];
  for (const row of selected.data ?? []) {
    const trace = readDiagnosticTrace(row.response);
    if (!trace) continue;
    items.push({
      ...trace,
      provider: typeof row.provider === "string" ? row.provider : trace.provider,
      model: typeof row.model === "string" ? row.model : trace.model,
      requestId: typeof row.request_id === "string" ? row.request_id : trace.requestId,
      inputTokens: typeof row.input_tokens === "number" ? row.input_tokens : trace.inputTokens,
      reasoningTokens: typeof row.reasoning_tokens === "number" ? row.reasoning_tokens : trace.reasoningTokens,
      outputTokens: typeof row.output_tokens === "number" ? row.output_tokens : trace.outputTokens,
      completedAt: typeof row.completed_at === "string" ? row.completed_at : "",
    });
  }
  return items;
}

export async function calledToday(): Promise<Record<ProviderId, number>> {
  const board = await providerBoard();
  return {
    groq: board.providers.find((item) => item.id === "groq")?.requestsToday ?? 0,
    openrouter: board.providers.find((item) => item.id === "openrouter")?.requestsToday ?? 0,
    gemini: board.providers.find((item) => item.id === "gemini")?.requestsToday ?? 0,
  };
}
