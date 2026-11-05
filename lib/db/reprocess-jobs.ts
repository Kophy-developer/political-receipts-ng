import "server-only";
import { columnMissing, serviceClient } from "@/lib/db/client";
import {
  activeReprocessPhases,
  claimDecision,
  type ProgressStep,
  type ReprocessJob,
  type ReprocessPhase,
} from "@/lib/intel/progress";
import { providerDisplay } from "@/lib/intel/stage";

type JobRow = {
  id: string;
  scan_id: string;
  request_id: string;
  phase: string;
  started_at: string;
  finished_at: string | null;
  posts: number | null;
  conversations: number | null;
  opportunities: number | null;
  provider: string | null;
  steps: unknown;
};

function phaseOf(value: string): ReprocessPhase {
  if (value === "preparing" || value === "extraction" || value === "classifying" || value === "opportunities" || value === "complete" || value === "failed") {
    return value;
  }
  return "failed";
}

function stepsOf(value: unknown): ProgressStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { provider?: unknown; state?: unknown; classification?: unknown };
    if (row.provider !== "groq" && row.provider !== "openrouter" && row.provider !== "gemini") return [];
    const state = row.state === "trying" || row.state === "failed" || row.state === "succeeded" ? row.state : "failed";
    return [{ provider: row.provider, state, classification: typeof row.classification === "string" ? row.classification : null }];
  });
}

export function jobFrom(row: JobRow): ReprocessJob {
  return {
    id: row.id,
    scanId: row.scan_id,
    requestId: row.request_id,
    phase: phaseOf(row.phase),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    posts: row.posts ?? 0,
    conversations: row.conversations ?? 0,
    opportunities: row.opportunities ?? 0,
    provider: row.provider,
    steps: stepsOf(row.steps),
  };
}

export async function latestReprocessJob(scanId: string): Promise<ReprocessJob | null> {
  const db = serviceClient();
  if (!db) return null;
  const result = await db.from("reprocess_jobs").select("*").eq("scan_id", scanId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error || !result.data) return null;
  return jobFrom(result.data as JobRow);
}

export async function claimReprocessJob(scanId: string, requestId: string, posts: number) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const current = await latestReprocessJob(scanId);
  if (claimDecision(current, Date.now()) === "attach" && current) {
    return { ok: true as const, claimed: false as const, job: current };
  }
  if (current && activeReprocessPhases.includes(current.phase as (typeof activeReprocessPhases)[number])) {
    await db.from("reprocess_jobs").update({ phase: "failed", finished_at: new Date().toISOString() }).eq("id", current.id);
  }
  const inserted = await db.from("reprocess_jobs").insert({
    scan_id: scanId,
    request_id: requestId,
    phase: "preparing",
    posts,
    conversations: 0,
    opportunities: 0,
    provider: null,
    steps: [],
  }).select("*").single();
  if (inserted.error) {
    const duplicate = inserted.error.code === "23505" || /duplicate|unique/i.test(inserted.error.message);
    const again = duplicate ? await latestReprocessJob(scanId) : null;
    if (again && claimDecision(again, Date.now()) === "attach") return { ok: true as const, claimed: false as const, job: again };
    return { ok: false as const, message: "The reprocess could not be started. No X request was made." };
  }
  return { ok: true as const, claimed: true as const, job: jobFrom(inserted.data as JobRow) };
}

export async function saveReprocessJob(id: string, patch: {
  phase?: ReprocessPhase;
  posts?: number;
  conversations?: number;
  opportunities?: number;
  provider?: string | null;
  steps?: ProgressStep[];
  finishedAt?: string | null;
}) {
  const db = serviceClient();
  if (!db) return;
  const row: Record<string, unknown> = {};
  if (patch.phase) row.phase = patch.phase;
  if (patch.posts !== undefined) row.posts = patch.posts;
  if (patch.conversations !== undefined) row.conversations = patch.conversations;
  if (patch.opportunities !== undefined) row.opportunities = patch.opportunities;
  if (patch.provider !== undefined) row.provider = patch.provider;
  if (patch.steps) row.steps = patch.steps;
  if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
  await db.from("reprocess_jobs").update(row).eq("id", id);
}

export type RecentScanRow = {
  id: string;
  startedAt: string;
  posts: number;
  analysis: string;
  opportunities: number | null;
  provider: string;
};

export async function listRecentScans(limit = 5): Promise<RecentScanRow[]> {
  const db = serviceClient();
  if (!db) return [];
  const scans = await db
    .from("scan_runs")
    .select("id, started_at, posts_stored, stage, status, detail")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (scans.error || !scans.data) return [];
  const ids = scans.data.map((row) => String(row.id));
  const jobs = await db.from("reprocess_jobs").select("scan_id, phase, provider, started_at").in("scan_id", ids).order("started_at", { ascending: false });
  const linked = await db.from("opportunities").select("scan_id").in("scan_id", ids);
  const opportunitiesLinked = !(linked.error && columnMissing(linked.error.message));
  const counts = new Map<string, number>();
  if (opportunitiesLinked) {
    for (const row of linked.data ?? []) {
      const id = String((row as { scan_id?: string }).scan_id ?? "");
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const latestJob = new Map<string, { phase: string; provider: string | null }>();
  if (!jobs.error) {
    for (const row of jobs.data ?? []) {
      const id = String(row.scan_id);
      if (!latestJob.has(id)) latestJob.set(id, { phase: String(row.phase), provider: typeof row.provider === "string" ? row.provider : null });
    }
  }
  return scans.data.map((row) => {
    const id = String(row.id);
    const detail = row.detail && typeof row.detail === "object" ? row.detail as { extractionProvider?: unknown } : {};
    const job = latestJob.get(id);
    const provider = job
      ? (job.phase === "failed" ? "None completed" : providerDisplay(job.provider))
      : providerDisplay(typeof detail.extractionProvider === "string" ? detail.extractionProvider : null);
    const analysis = job?.phase === "complete"
      ? "Complete"
      : job?.phase === "failed"
        ? "Analysis incomplete"
        : row.stage === "AI_PROCESSING"
          ? "In progress"
          : row.status === "completed" || row.stage === "COMPLETE"
            ? "Complete"
            : "Analysis incomplete";
    const linkedCount = counts.get(id) ?? 0;
    const opportunities = !opportunitiesLinked ? null : job || linkedCount > 0 ? linkedCount : null;
    return {
      id,
      startedAt: String(row.started_at),
      posts: typeof row.posts_stored === "number" ? row.posts_stored : 0,
      analysis,
      opportunities,
      provider: provider === "Not recorded" && !job ? "Not recorded" : provider,
    };
  });
}
