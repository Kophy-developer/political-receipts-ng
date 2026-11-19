import "server-only";
import { serviceClient } from "@/lib/db/client";
import { parsePipelineLastRun } from "@/lib/desk/pipeline";
import { canStartScheduledRun, defaultSchedule, type DeskSchedule, type ScheduleMode } from "@/lib/desk/schedule";

function modeOf(value: unknown): ScheduleMode {
  if (value === "every-3-hours" || value === "every-4-hours" || value === "custom" || value === "manual") return value;
  return "manual";
}

function scheduleFromRow(data: Record<string, unknown>): DeskSchedule {
  return {
    enabled: data.enabled === true,
    mode: modeOf(data.mode),
    customHours: typeof data.custom_hours === "number" ? data.custom_hours : null,
    runningSince: typeof data.running_since === "string" ? data.running_since : null,
    lastStartedAt: typeof data.last_started_at === "string" ? data.last_started_at : null,
    lastFinishedAt: typeof data.last_finished_at === "string" ? data.last_finished_at : null,
    lastRun: parsePipelineLastRun(data.last_run),
  };
}

export async function loadDeskSchedule(): Promise<DeskSchedule> {
  const db = serviceClient();
  if (!db) return defaultSchedule;
  const row = await db.from("desk_schedule").select("enabled, mode, custom_hours, running_since, last_started_at, last_finished_at, last_run").eq("id", "default").maybeSingle();
  if (!row.error && row.data) return scheduleFromRow(row.data as Record<string, unknown>);
  const legacy = await db.from("desk_schedule").select("enabled, mode, custom_hours, running_since, last_started_at, last_finished_at").eq("id", "default").maybeSingle();
  if (legacy.error || !legacy.data) return defaultSchedule;
  return scheduleFromRow(legacy.data as Record<string, unknown>);
}

export function scheduledRunGuard(schedule: DeskSchedule) {
  return canStartScheduledRun(schedule);
}
