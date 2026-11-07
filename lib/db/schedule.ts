import "server-only";
import { serviceClient } from "@/lib/db/client";
import { canStartScheduledRun, defaultSchedule, type DeskSchedule, type ScheduleMode } from "@/lib/desk/schedule";

function modeOf(value: unknown): ScheduleMode {
  if (value === "every-3-hours" || value === "every-4-hours" || value === "custom" || value === "manual") return value;
  return "manual";
}

export async function loadDeskSchedule(): Promise<DeskSchedule> {
  const db = serviceClient();
  if (!db) return defaultSchedule;
  const row = await db.from("desk_schedule").select("enabled, mode, custom_hours, running_since, last_started_at, last_finished_at").eq("id", "default").maybeSingle();
  if (row.error || !row.data) return defaultSchedule;
  return {
    enabled: row.data.enabled === true,
    mode: modeOf(row.data.mode),
    customHours: typeof row.data.custom_hours === "number" ? row.data.custom_hours : null,
    runningSince: typeof row.data.running_since === "string" ? row.data.running_since : null,
    lastStartedAt: typeof row.data.last_started_at === "string" ? row.data.last_started_at : null,
    lastFinishedAt: typeof row.data.last_finished_at === "string" ? row.data.last_finished_at : null,
  };
}

export function scheduledRunGuard(schedule: DeskSchedule) {
  return canStartScheduledRun(schedule);
}
