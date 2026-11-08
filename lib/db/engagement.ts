import "server-only";
import { columnMissing, serviceClient } from "@/lib/db/client";
import { defaultEngagement, parseEngagement, type EngagementSetting } from "@/lib/intel/engagement";

export async function loadEngagement(): Promise<{ ok: true; setting: EngagementSetting } | { ok: false; message: string }> {
  const db = serviceClient();
  if (!db) return { ok: true, setting: defaultEngagement };
  const row = await db.from("desk_schedule").select("engagement_metric, engagement_minimum").eq("id", "default").maybeSingle();
  if (row.error && columnMissing(row.error.message)) return { ok: true, setting: defaultEngagement };
  if (row.error || !row.data) return { ok: false, message: "The engagement threshold could not be read. No X request was made." };
  return parseEngagement({ metric: row.data.engagement_metric, minimum: row.data.engagement_minimum });
}

export async function saveEngagement(input: { metric?: unknown; minimum?: unknown }) {
  const parsed = parseEngagement(input);
  if (!parsed.ok) return { ok: false as const, message: parsed.message };
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured. The threshold was not saved." };
  const saved = await db.from("desk_schedule").update({
    engagement_metric: parsed.setting.metric,
    engagement_minimum: parsed.setting.minimum,
    updated_at: new Date().toISOString(),
  }).eq("id", "default");
  if (saved.error) return { ok: false as const, message: "The engagement threshold could not be saved. No X request was made." };
  return { ok: true as const, setting: parsed.setting, message: `Saved ${parsed.setting.metric === "replies" ? "min_replies" : parsed.setting.metric === "likes" ? "min_likes" : "min_reposts"}:${parsed.setting.minimum}. The next scan sends this operator to X.` };
}
