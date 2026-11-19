import { canStartScheduledRun, type DeskSchedule } from "@/lib/desk/schedule";

export const pipelineDevelopLimit = 2;
export const scheduleRunMaxDurationSeconds = 300;
export const staleScheduleRunningMs = (scheduleRunMaxDurationSeconds + 60) * 1000;

export type PipelineDevelopOutcome = {
  id: string;
  ready: boolean;
  message: string;
};

export type PipelineLastRun = {
  finishedAt: string;
  scanned: boolean;
  postsReturned: number;
  claimsKept: number;
  queriesRun: number;
  developAttempted: number;
  readyCount: number;
  blockedCount: number;
  message: string;
  developed: PipelineDevelopOutcome[];
};

export function pipelineFunnelLine(run: Pick<PipelineLastRun, "postsReturned" | "claimsKept" | "developAttempted" | "readyCount" | "blockedCount" | "queriesRun" | "scanned">) {
  const scan = run.scanned
    ? `Scan found ${run.postsReturned} post${run.postsReturned === 1 ? "" : "s"} (${run.queriesRun} X search${run.queriesRun === 1 ? "" : "es"}), extract kept ${run.claimsKept} claim${run.claimsKept === 1 ? "" : "s"}.`
    : "Scan did not run.";
  const develop = `Develop attempted ${run.developAttempted}, ready ${run.readyCount}${run.blockedCount > 0 ? `, stopped short ${run.blockedCount}` : ""}.`;
  return `${scan} ${develop}`;
}

export function parsePipelineLastRun(value: unknown): PipelineLastRun | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.finishedAt !== "string" || typeof row.message !== "string") return null;
  const developed = Array.isArray(row.developed)
    ? row.developed.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== "string" || typeof entry.message !== "string") return [];
      return [{ id: entry.id, ready: entry.ready === true, message: entry.message }];
    })
    : [];
  return {
    finishedAt: row.finishedAt,
    scanned: row.scanned === true,
    postsReturned: typeof row.postsReturned === "number" ? row.postsReturned : 0,
    claimsKept: typeof row.claimsKept === "number" ? row.claimsKept : 0,
    queriesRun: typeof row.queriesRun === "number" ? row.queriesRun : 0,
    developAttempted: typeof row.developAttempted === "number" ? row.developAttempted : developed.length,
    readyCount: typeof row.readyCount === "number" ? row.readyCount : developed.filter((item) => item.ready).length,
    blockedCount: typeof row.blockedCount === "number" ? row.blockedCount : developed.filter((item) => !item.ready).length,
    message: row.message,
    developed,
  };
}

export function pipelinePlan(schedule: DeskSchedule, opportunityIds: string[]) {
  const guard = canStartScheduledRun(schedule);
  if (!guard.ok) return { ok: false as const, reason: guard.reason, developIds: [] as string[] };
  return {
    ok: true as const,
    reason: "One scan may run, then up to two ranked stories may be developed. Publishing stays manual.",
    developIds: opportunityIds.slice(0, pipelineDevelopLimit),
  };
}

export function scheduleIntervalHours(schedule: DeskSchedule) {
  if (schedule.mode === "every-3-hours") return 3;
  if (schedule.mode === "every-4-hours") return 4;
  if (schedule.mode === "custom" && schedule.customHours) return schedule.customHours;
  return null;
}

export function dueForScheduledRun(schedule: DeskSchedule, now = Date.now()) {
  const plan = pipelinePlan(schedule, []);
  if (!plan.ok) return plan;
  const hours = scheduleIntervalHours(schedule);
  if (!hours) return { ok: false as const, reason: "Manual mode does not start a scan by itself.", developIds: [] as string[] };
  if (!schedule.lastFinishedAt && !schedule.lastStartedAt) return { ok: true as const, reason: plan.reason, developIds: [] as string[] };
  const last = Date.parse(schedule.lastFinishedAt || schedule.lastStartedAt || "");
  if (!Number.isFinite(last)) return { ok: true as const, reason: plan.reason, developIds: [] as string[] };
  if (now - last < hours * 3_600_000) {
    return { ok: false as const, reason: `The next run waits until ${hours} hours after the last finished scan.`, developIds: [] as string[] };
  }
  return { ok: true as const, reason: plan.reason, developIds: [] as string[] };
}
