export const scheduleModes = ["manual", "every-3-hours", "every-4-hours", "custom"] as const;

export type ScheduleMode = (typeof scheduleModes)[number];

export type DeskSchedule = {
  enabled: false | true;
  mode: ScheduleMode;
  customHours: number | null;
  runningSince: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
};

export const defaultSchedule: DeskSchedule = {
  enabled: false,
  mode: "manual",
  customHours: null,
  runningSince: null,
  lastStartedAt: null,
  lastFinishedAt: null,
};

export function customIntervalHours(hours: number) {
  return Number.isInteger(hours) && hours >= 3 && hours <= 24;
}

export function scheduleReadiness(input: {
  planSupportsCron: boolean;
  xCallsRemaining: number | null;
  scanCostKnown: boolean;
  researchBudgetKnown: boolean;
  modelBudgetKnown: boolean;
  editorConfirmed: boolean;
}) {
  const reasons: string[] = [];
  if (!input.editorConfirmed) reasons.push("An editor has not turned scheduling on.");
  if (!input.planSupportsCron) reasons.push("The hosting plan has no confirmed scheduler for this project.");
  if (input.xCallsRemaining === null) reasons.push("The remaining X API allowance is not known.");
  if (!input.scanCostKnown) reasons.push("The cost of one scan is not on file.");
  if (!input.researchBudgetKnown || !input.modelBudgetKnown) reasons.push("Research and model budgets are not both known.");
  reasons.push("A scheduled run cannot publish. Publishing stays on the exact-text confirmation.");
  return { canEnable: reasons.length === 1 && input.editorConfirmed && input.planSupportsCron, reasons };
}

export function canStartScheduledRun(schedule: DeskSchedule) {
  if (!schedule.enabled) return { ok: false as const, reason: "Scheduling is off." };
  if (schedule.runningSince) return { ok: false as const, reason: "A scheduled scan is already running." };
  if (schedule.mode === "manual") return { ok: false as const, reason: "Manual mode does not start a scan by itself." };
  if (schedule.mode === "custom" && !customIntervalHours(schedule.customHours || 0)) {
    return { ok: false as const, reason: "The custom interval must be a whole number of hours from 3 to 24." };
  }
  return { ok: true as const, reason: "The schedule may start one scan. It cannot publish." };
}
