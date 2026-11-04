import "server-only";
import {
  modelNote,
  planDraftProviders,
  type ProviderCard,
  type ProviderId,
} from "@/lib/ai/catalog";
import { retainedFailure, shownProviderStatus, type ProviderDiagnostic } from "@/lib/ai/diagnostics";
import { credentialPresent, readAiEnv } from "@/lib/ai/runtime";
import { columnMissing, schemaMissing, serviceClient } from "@/lib/db/client";
import type { StampedAttempt } from "@/lib/drafts/chain";
import { lagosDayStart } from "@/lib/intel/limits";
import { usageSince } from "@/lib/db/usage";

type AttemptRow = {
  provider: ProviderId;
  status: "success" | "failure" | "rejected";
  called: boolean;
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
  }));
  const { error } = await db.from("ai_attempts").insert(payload);
  return { ok: !error };
}

async function rowsSince(startIso: string) {
  const db = serviceClient();
  if (!db) return { rows: [] as AttemptRow[], blocked: false };
  const selected = await db
    .from("ai_attempts")
    .select("provider, status, called, failure_reason, diagnostic, completed_at, input_tokens, reasoning_tokens, output_tokens, total_tokens")
    .gte("completed_at", startIso)
    .order("completed_at", { ascending: false });
  if (selected.error && columnMissing(selected.error.message)) {
    const plain = await db
      .from("ai_attempts")
      .select("provider, status, called, failure_reason, diagnostic, completed_at, input_tokens, output_tokens")
      .gte("completed_at", startIso)
      .order("completed_at", { ascending: false });
    if (plain.error && columnMissing(plain.error.message)) {
      const older = await db
        .from("ai_attempts")
        .select("provider, status, called, failure_reason, completed_at")
        .gte("completed_at", startIso)
        .order("completed_at", { ascending: false });
      if (older.error) return { rows: [] as AttemptRow[], blocked: !schemaMissing(older.error.message) };
      return {
        rows: ((older.data ?? []) as Array<Pick<AttemptRow, "provider" | "status" | "called" | "failure_reason" | "completed_at">>).map((row) => ({
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
  const lastCalledFailure: Record<ProviderId, string | null> = { groq: null, openrouter: null, gemini: null };
  const lastSkip: Record<ProviderId, string | null> = { groq: null, openrouter: null, gemini: null };
  const latestCalled: Record<ProviderId, AttemptRow | null> = { groq: null, openrouter: null, gemini: null };
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
    if (!latestCalled[row.provider]) latestCalled[row.provider] = row;
    called[row.provider] += 1;
    if (row.status === "success") successful[row.provider] += 1;
    else failed[row.provider] += 1;
    if (!lastCalledFailure[row.provider] && row.status !== "success") {
      const retained = retainedFailure(row.failure_reason, row.diagnostic);
      lastCalledFailure[row.provider] = retained?.text ?? row.failure_reason;
      lostOriginal[row.provider] = retained?.retained === false && row.failure_reason === "unavailable";
    }
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
        lastFailure: lastCalledFailure[plan.id] ?? lastSkip[plan.id],
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

export async function calledToday(): Promise<Record<ProviderId, number>> {
  const board = await providerBoard();
  return {
    groq: board.providers.find((item) => item.id === "groq")?.requestsToday ?? 0,
    openrouter: board.providers.find((item) => item.id === "openrouter")?.requestsToday ?? 0,
    gemini: board.providers.find((item) => item.id === "gemini")?.requestsToday ?? 0,
  };
}
