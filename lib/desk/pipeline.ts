import { canStartScheduledRun, type DeskSchedule } from "@/lib/desk/schedule";

export const pipelineDevelopLimit = 2;

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
