import "server-only";
import { developContent } from "@/lib/db/develop";
import { serviceClient } from "@/lib/db/client";
import { loadDeskSchedule } from "@/lib/db/schedule";
import {
  dueForScheduledRun,
  pipelineDevelopLimit,
  pipelineFunnelLine,
  staleScheduleRunningMs,
  type PipelineDevelopOutcome,
  type PipelineLastRun,
} from "@/lib/desk/pipeline";
import { runScan } from "@/lib/intel/run";
import { chooseScan } from "@/lib/pillars/scan";
import { loadDiscoveryContext } from "@/lib/db/pillars";

export type PipelineRunResult = {
  ok: boolean;
  message: string;
  scanned: boolean;
  scanMessage?: string | null;
  developed: PipelineDevelopOutcome[];
  lastRun: PipelineLastRun | null;
  posted: false;
};

async function markSchedule(patch: {
  runningSince?: string | null;
  lastStartedAt?: string | null;
  lastFinishedAt?: string | null;
  lastRun?: PipelineLastRun | null;
}) {
  const db = serviceClient();
  if (!db) return;
  const base = {
    ...(patch.runningSince !== undefined ? { running_since: patch.runningSince } : {}),
    ...(patch.lastStartedAt !== undefined ? { last_started_at: patch.lastStartedAt } : {}),
    ...(patch.lastFinishedAt !== undefined ? { last_finished_at: patch.lastFinishedAt } : {}),
    updated_at: new Date().toISOString(),
  };
  if (patch.lastRun !== undefined) {
    const withRun = await db.from("desk_schedule").update({ ...base, last_run: patch.lastRun }).eq("id", "default");
    if (!withRun.error) return;
  }
  await db.from("desk_schedule").update(base).eq("id", "default");
}

export async function listRankedForPipeline(limit = pipelineDevelopLimit) {
  const db = serviceClient();
  if (!db) return [] as string[];
  const listed = await db
    .from("opportunities")
    .select("id, lifecycle, development, updated_at")
    .in("lifecycle", ["RANKED", "DISCOVERED", "ASSESSED", "RESEARCHING", "EVIDENCE_READY", "ANGLE_READY", "DRAFTING"])
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 3, 6));
  if (listed.error || !listed.data) return [];
  const ids: string[] = [];
  for (const row of listed.data) {
    if (typeof row.id !== "string") continue;
    const development = row.development;
    if (development && typeof development === "object" && !Array.isArray(development) && (development as { ready?: unknown }).ready === true) continue;
    ids.push(row.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function clearStaleRunningLock(runningSince: string | null) {
  if (!runningSince) return false;
  const started = Date.parse(runningSince);
  if (!Number.isFinite(started) || Date.now() - started < staleScheduleRunningMs) return false;
  await markSchedule({ runningSince: null });
  return true;
}

function buildLastRun(input: {
  finishedAt: string;
  scanned: boolean;
  postsReturned: number;
  claimsKept: number;
  queriesRun: number;
  developed: PipelineDevelopOutcome[];
  message: string;
}): PipelineLastRun {
  const readyCount = input.developed.filter((item) => item.ready).length;
  const blockedCount = input.developed.length - readyCount;
  return {
    finishedAt: input.finishedAt,
    scanned: input.scanned,
    postsReturned: input.postsReturned,
    claimsKept: input.claimsKept,
    queriesRun: input.queriesRun,
    developAttempted: input.developed.length,
    readyCount,
    blockedCount,
    message: input.message,
    developed: input.developed,
  };
}

function skippedResult(message: string): PipelineRunResult {
  return {
    ok: false,
    message,
    scanned: false,
    developed: [],
    lastRun: null,
    posted: false,
  };
}

export async function claimBackgroundPipeline(input?: { force?: boolean; skipScan?: boolean }) {
  let schedule = await loadDeskSchedule();
  if (await clearStaleRunningLock(schedule.runningSince)) {
    schedule = await loadDeskSchedule();
  }
  if (!input?.force) {
    const due = dueForScheduledRun(schedule);
    if (!due.ok) {
      return { claimed: false as const, result: skippedResult(due.reason) };
    }
  } else if (schedule.runningSince) {
    return { claimed: false as const, result: skippedResult("A scheduled scan is already running.") };
  }
  const started = new Date().toISOString();
  await markSchedule({ runningSince: started, lastStartedAt: started });
  return { claimed: true as const, skipScan: input?.skipScan === true, started };
}

export async function executeClaimedBackgroundPipeline(input?: { skipScan?: boolean }): Promise<PipelineRunResult> {
  let scanned = false;
  let scanMessage: string | null = null;
  let postsReturned = 0;
  let claimsKept = 0;
  let queriesRun = 0;
  try {
    if (!input?.skipScan) {
      const context = await loadDiscoveryContext();
      const choice = chooseScan("smart", context.signals, context.publishedTotal, context.allowance);
      if (!choice.runnable) {
        scanMessage = choice.reason;
      } else {
        const report = await runScan({ pillars: choice.pillars });
        scanned = true;
        postsReturned = report.postsReturned;
        claimsKept = report.claims;
        queriesRun = report.queriesRun ?? choice.estimatedRequests;
        scanMessage = report.stopped || (report.ok
          ? `Scan finished across ${report.pillarsSearched ?? choice.pillarsSearched} pillar(s) with ${report.queriesRun ?? choice.estimatedRequests} X search(es).`
          : "Scan stopped.");
      }
    }
    const ids = await listRankedForPipeline(pipelineDevelopLimit);
    const developed: PipelineDevelopOutcome[] = [];
    for (const id of ids) {
      const result = await developContent(id);
      developed.push({
        id,
        ready: result.ready === true,
        message: result.message,
      });
    }
    const finishedAt = new Date().toISOString();
    const readyCount = developed.filter((item) => item.ready).length;
    const blocked = developed.filter((item) => !item.ready);
    const funnel = pipelineFunnelLine({
      scanned,
      postsReturned,
      claimsKept,
      queriesRun,
      developAttempted: developed.length,
      readyCount,
      blockedCount: blocked.length,
    });
    const blockedHint = blocked.length > 0
      ? ` ${blocked.map((item) => item.message).filter(Boolean).slice(0, 2).join(" ")}`
      : "";
    const message = readyCount > 0
      ? `${readyCount} draft${readyCount === 1 ? "" : "s"} ready for the Approve queue. ${funnel} Nothing was published.`
      : `${funnel}${blockedHint || (scanMessage ? ` ${scanMessage}` : "")} No draft reached Ready for editor. Nothing was published.`;
    const lastRun = buildLastRun({
      finishedAt,
      scanned,
      postsReturned,
      claimsKept,
      queriesRun,
      developed,
      message,
    });
    await markSchedule({ runningSince: null, lastFinishedAt: finishedAt, lastRun });
    return {
      ok: true,
      message,
      scanned,
      scanMessage,
      developed,
      lastRun,
      posted: false,
    };
  } catch {
    const finishedAt = new Date().toISOString();
    const message = "The background pipeline stopped before it finished. Nothing was published.";
    const lastRun = buildLastRun({
      finishedAt,
      scanned,
      postsReturned,
      claimsKept,
      queriesRun,
      developed: [],
      message,
    });
    await markSchedule({ runningSince: null, lastFinishedAt: finishedAt, lastRun });
    return {
      ok: false,
      message,
      scanned,
      developed: [],
      lastRun,
      posted: false,
    };
  }
}

export async function runBackgroundPipeline(input?: { force?: boolean; skipScan?: boolean }) {
  const claim = await claimBackgroundPipeline(input);
  if (!claim.claimed) return claim.result;
  return executeClaimedBackgroundPipeline({ skipScan: claim.skipScan });
}

export async function saveDeskSchedule(input: {
  enabled: boolean;
  mode: "manual" | "every-3-hours" | "every-4-hours" | "custom";
  customHours?: number | null;
  editorConfirmed: boolean;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (input.enabled && !input.editorConfirmed) {
    return { ok: false as const, message: "Turn scheduling on only after you confirm the cost checks." };
  }
  if (input.enabled && input.mode === "manual") {
    return { ok: false as const, message: "Choose an interval before turning scheduling on." };
  }
  if (input.mode === "custom") {
    const hours = input.customHours ?? 0;
    if (!Number.isInteger(hours) || hours < 3 || hours > 24) {
      return { ok: false as const, message: "Custom intervals must be a whole number of hours from 3 to 24." };
    }
  }
  const saved = await db.from("desk_schedule").update({
    enabled: input.enabled,
    mode: input.mode,
    custom_hours: input.mode === "custom" ? input.customHours ?? null : null,
    updated_at: new Date().toISOString(),
  }).eq("id", "default").select("id").maybeSingle();
  if (saved.error || !saved.data) return { ok: false as const, message: "The schedule could not be saved." };
  return {
    ok: true as const,
    message: input.enabled
      ? "Scheduling is on. Cron may start a scan when the interval is due. It still cannot publish."
      : "Scheduling is off. Cron calls will no-op until you turn it on again.",
  };
}
