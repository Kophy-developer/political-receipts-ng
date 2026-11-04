import "server-only";
import type { UsageView } from "@/lib/desk/types";
import { schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { lagosDayLabel, lagosDayStart, scanLimits } from "@/lib/intel/limits";

export type UsageTotals = {
  xRequests: number;
  posts: number;
  geminiRequests: number;
  inputTokens: number;
  outputTokens: number;
};

const emptyTotals: UsageTotals = { xRequests: 0, posts: 0, geminiRequests: 0, inputTokens: 0, outputTokens: 0 };

export async function usageSince(startIso: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const, totals: emptyTotals };
  const { data, error } = await db
    .from("api_usage")
    .select("provider, requests, units, input_tokens, output_tokens")
    .gte("occurred_at", startIso);
  if (error) {
    return {
      ok: false as const,
      reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const),
      message: scrubDbMessage(error.message),
      totals: emptyTotals,
    };
  }
  const totals = { ...emptyTotals };
  for (const row of data ?? []) {
    const requests = typeof row.requests === "number" ? row.requests : 0;
    const units = typeof row.units === "number" ? row.units : 0;
    if (row.provider === "x") {
      totals.xRequests += requests;
      totals.posts += units;
    }
    if (row.provider === "gemini") {
      totals.geminiRequests += requests;
      totals.inputTokens += typeof row.input_tokens === "number" ? row.input_tokens : 0;
      totals.outputTokens += typeof row.output_tokens === "number" ? row.output_tokens : 0;
    }
  }
  return { ok: true as const, totals };
}

export async function recordUsage(input: {
  provider: "x" | "gemini";
  operation: string;
  requests: number;
  units: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  scanId?: string | null;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const };
  const { error } = await db.from("api_usage").insert({
    provider: input.provider,
    operation: input.operation,
    requests: input.requests,
    units: input.units,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    scan_id: input.scanId ?? null,
  });
  return { ok: !error };
}

function durationLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export async function usageView(): Promise<UsageView> {
  const base: UsageView = {
    installed: false,
    dayLabel: lagosDayLabel(),
    xRequests: 0,
    xRequestLimit: scanLimits.dailyXRequests,
    posts: 0,
    postLimit: scanLimits.dailyPosts,
    geminiRequests: 0,
    geminiLimit: scanLimits.dailyGeminiRequests,
    inputTokens: null,
    outputTokens: null,
    lastDuration: null,
    groups: 0,
    perScanPosts: scanLimits.maxPostsPerScan,
    perScanRequests: scanLimits.maxXRequestsPerScan,
    lookbackHours: scanLimits.lookbackHours,
    minEngagement: scanLimits.minEngagement,
  };
  const db = serviceClient();
  if (!db) return base;
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return base;
  base.installed = true;
  base.xRequests = usage.totals.xRequests;
  base.posts = usage.totals.posts;
  base.geminiRequests = usage.totals.geminiRequests;
  base.inputTokens = usage.totals.inputTokens;
  base.outputTokens = usage.totals.outputTokens;
  const [{ count }, last] = await Promise.all([
    db.from("search_groups").select("id", { count: "exact", head: true }).eq("enabled", true),
    db.from("scan_runs").select("duration_ms").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  base.groups = count ?? 0;
  base.lastDuration = durationLabel(typeof last.data?.duration_ms === "number" ? last.data.duration_ms : null);
  return base;
}
