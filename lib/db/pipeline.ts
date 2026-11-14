import "server-only";
import { developContent } from "@/lib/db/develop";
import { serviceClient } from "@/lib/db/client";
import { loadDeskSchedule } from "@/lib/db/schedule";
import { dueForScheduledRun, pipelineDevelopLimit } from "@/lib/desk/pipeline";
import { runScan } from "@/lib/intel/run";
import { chooseScan } from "@/lib/pillars/scan";
import { loadDiscoveryContext } from "@/lib/db/pillars";
import { storagePillar } from "@/lib/pillars/catalog";

async function markSchedule(patch: {
  runningSince?: string | null;
  lastStartedAt?: string | null;
  lastFinishedAt?: string | null;
}) {
  const db = serviceClient();
  if (!db) return;
  await db.from("desk_schedule").update({
    ...(patch.runningSince !== undefined ? { running_since: patch.runningSince } : {}),
    ...(patch.lastStartedAt !== undefined ? { last_started_at: patch.lastStartedAt } : {}),
    ...(patch.lastFinishedAt !== undefined ? { last_finished_at: patch.lastFinishedAt } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", "default");
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

export async function runBackgroundPipeline(input?: { force?: boolean; skipScan?: boolean }) {
  const schedule = await loadDeskSchedule();
  if (!input?.force) {
    const due = dueForScheduledRun(schedule);
    if (!due.ok) {
      return {
        ok: false as const,
        message: due.reason,
        scanned: false,
        developed: [] as Array<{ id: string; ready: boolean; message: string }>,
        posted: false as const,
      };
    }
  } else if (schedule.runningSince) {
    return {
      ok: false as const,
      message: "A scheduled scan is already running.",
      scanned: false,
      developed: [] as Array<{ id: string; ready: boolean; message: string }>,
      posted: false as const,
    };
  }
  const started = new Date().toISOString();
  await markSchedule({ runningSince: started, lastStartedAt: started });
  let scanned = false;
  let scanMessage: string | null = null;
  try {
    if (!input?.skipScan) {
      const context = await loadDiscoveryContext();
      const choice = chooseScan("smart", context.signals, context.publishedTotal, context.allowance);
      if (!choice.runnable) {
        scanMessage = choice.reason;
      } else {
        const report = await runScan({ storagePillar: storagePillar(choice.pillar) });
        scanned = true;
        scanMessage = report.stopped || (report.ok ? "Scan finished." : "Scan stopped.");
      }
    }
    const ids = await listRankedForPipeline(pipelineDevelopLimit);
    const developed: Array<{ id: string; ready: boolean; message: string }> = [];
    for (const id of ids) {
      const result = await developContent(id);
      developed.push({
        id,
        ready: result.ready === true,
        message: result.message,
      });
    }
    await markSchedule({ runningSince: null, lastFinishedAt: new Date().toISOString() });
    const readyCount = developed.filter((item) => item.ready).length;
    return {
      ok: true as const,
      message: readyCount > 0
        ? `${readyCount} draft${readyCount === 1 ? "" : "s"} ready for the Approve queue. Nothing was published.`
        : (scanMessage || "Pipeline finished. No draft reached Ready for editor. Nothing was published."),
      scanned,
      scanMessage,
      developed,
      posted: false as const,
    };
  } catch {
    await markSchedule({ runningSince: null, lastFinishedAt: new Date().toISOString() });
    return {
      ok: false as const,
      message: "The background pipeline stopped before it finished. Nothing was published.",
      scanned,
      developed: [] as Array<{ id: string; ready: boolean; message: string }>,
      posted: false as const,
    };
  }
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
