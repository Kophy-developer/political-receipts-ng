import "server-only";
import { schemaMissing, serviceClient } from "@/lib/db/client";

export async function performanceSummary() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { count, error } = await db.from("post_metrics").select("id", { count: "exact", head: true });
  if (error) return { ok: false as const, reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const) };
  return { ok: true as const, readings: count ?? 0 };
}
