import "server-only";
import {
  modelNote,
  planDraftProviders,
  providerStatus,
  type ProviderCard,
  type ProviderId,
} from "@/lib/ai/catalog";
import { credentialPresent, readAiEnv } from "@/lib/ai/runtime";
import { schemaMissing, serviceClient } from "@/lib/db/client";
import type { StampedAttempt } from "@/lib/drafts/chain";
import { lagosDayStart } from "@/lib/intel/limits";
import { usageSince } from "@/lib/db/usage";

type AttemptRow = {
  provider: ProviderId;
  status: "success" | "failure" | "rejected";
  called: boolean;
  failure_reason: string | null;
  completed_at: string;
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
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
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
  const { data, error } = await db
    .from("ai_attempts")
    .select("provider, status, called, failure_reason, completed_at")
    .gte("completed_at", startIso)
    .order("completed_at", { ascending: false });
  if (error) return { rows: [] as AttemptRow[], blocked: !schemaMissing(error.message) };
  return { rows: (data ?? []) as AttemptRow[], blocked: false };
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
  for (const row of loaded.rows) {
    if (!row.called) {
      if (!lastSkip[row.provider] && row.failure_reason) lastSkip[row.provider] = row.failure_reason;
      continue;
    }
    called[row.provider] += 1;
    if (row.status === "success") successful[row.provider] += 1;
    else failed[row.provider] += 1;
    if (!lastCalledFailure[row.provider] && row.status !== "success" && row.failure_reason) lastCalledFailure[row.provider] = row.failure_reason;
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
      const note = plan.skipReason === "paid route blocked"
        ? "This model is not a free route. It is skipped while AI paid usage is off."
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
        modelNote: modelNote(plan),
        requestsToday,
        successfulRequests: successful[plan.id],
        failedRequests: failed[plan.id],
        lastFailure: lastCalledFailure[plan.id] ?? lastSkip[plan.id],
        status: providerStatus(plan, used[plan.id], env.daily[plan.id]),
        note,
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
