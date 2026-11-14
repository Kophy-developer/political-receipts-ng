import { connection } from "next/server";
import { loadDeskSchedule } from "@/lib/db/schedule";
import { saveDeskSchedule } from "@/lib/db/pipeline";
import { scheduleSecretConfigured } from "@/lib/auth/schedule";
import { scheduleReadiness } from "@/lib/desk/schedule";
import { assertEditorRequest } from "@/lib/x/guard";

export async function GET(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  const schedule = await loadDeskSchedule();
  const readiness = scheduleReadiness({
    planSupportsCron: true,
    xCallsRemaining: null,
    scanCostKnown: true,
    researchBudgetKnown: true,
    modelBudgetKnown: true,
    editorConfirmed: schedule.enabled,
  });
  return Response.json({
    ok: true,
    schedule,
    cronSecret: scheduleSecretConfigured(),
    readiness,
    message: schedule.enabled
      ? "Scheduling is on. Cron can start a scan when due. It cannot publish."
      : "Scheduling is off by default. Arm it only when X and research budgets allow.",
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { enabled?: unknown; mode?: unknown; customHours?: unknown; editorConfirmed?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The schedule request could not be read." }, { status: 400 });
  }
  const mode = body.mode === "every-3-hours" || body.mode === "every-4-hours" || body.mode === "custom" || body.mode === "manual"
    ? body.mode
    : "manual";
  const saved = await saveDeskSchedule({
    enabled: body.enabled === true,
    mode,
    customHours: typeof body.customHours === "number" ? body.customHours : null,
    editorConfirmed: body.editorConfirmed === true,
  });
  return Response.json(saved, { status: saved.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
