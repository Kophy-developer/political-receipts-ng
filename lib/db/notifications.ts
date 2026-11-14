import "server-only";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";

export type PublisherNotification = {
  id: string;
  opportunityId: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function recordReadyNotification(input: {
  opportunityId: string;
  title: string;
  body?: string | null;
}) {
  const db = serviceClient();
  if (!db || !isUuid(input.opportunityId)) return { ok: false as const, message: "The notification could not be stored." };
  const title = input.title.trim().slice(0, 180) || "Draft ready for approval";
  const body = (input.body?.trim() || "A draft is waiting on the Approve queue.").slice(0, 500);
  const saved = await db.from("publisher_notifications").upsert({
    opportunity_id: input.opportunityId,
    kind: "ready_for_editor",
    title,
    body,
    read_at: null,
    created_at: new Date().toISOString(),
  }, { onConflict: "opportunity_id,kind" }).select("id").maybeSingle();
  if (saved.error && columnMissing(saved.error.message)) {
    return { ok: false as const, message: "Ready notifications are not installed on this database yet." };
  }
  if (saved.error) return { ok: false as const, message: scrubDbMessage(saved.error.message) };
  return { ok: true as const, id: saved.data?.id as string | undefined };
}

export async function listUnreadReadyNotifications(limit = 20): Promise<{
  items: PublisherNotification[];
  count: number;
  installed: boolean;
}> {
  const db = serviceClient();
  if (!db) return { items: [], count: 0, installed: false };
  const listed = await db
    .from("publisher_notifications")
    .select("id, opportunity_id, title, body, created_at, read_at")
    .eq("kind", "ready_for_editor")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (listed.error && columnMissing(listed.error.message)) {
    return { items: [], count: 0, installed: false };
  }
  if (listed.error || !listed.data) return { items: [], count: 0, installed: true };
  const items = listed.data.flatMap((row) => {
    if (typeof row.id !== "string" || typeof row.opportunity_id !== "string") return [];
    return [{
      id: row.id,
      opportunityId: row.opportunity_id,
      title: typeof row.title === "string" ? row.title : "Draft ready for approval",
      body: typeof row.body === "string" ? row.body : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      readAt: typeof row.read_at === "string" ? row.read_at : null,
    } satisfies PublisherNotification];
  });
  return { items, count: items.length, installed: true };
}

export async function markReadyNotificationsRead(input?: { opportunityId?: string }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured.", count: 0 };
  const now = new Date().toISOString();
  let query = db
    .from("publisher_notifications")
    .update({ read_at: now })
    .eq("kind", "ready_for_editor")
    .is("read_at", null)
    .select("id");
  if (input?.opportunityId) {
    if (!isUuid(input.opportunityId)) return { ok: false as const, message: "That draft could not be marked read.", count: 0 };
    query = query.eq("opportunity_id", input.opportunityId);
  }
  const updated = await query;
  if (updated.error && columnMissing(updated.error.message)) {
    return { ok: false as const, message: "Ready notifications are not installed on this database yet.", count: 0 };
  }
  if (updated.error) return { ok: false as const, message: scrubDbMessage(updated.error.message), count: 0 };
  return { ok: true as const, count: updated.data?.length ?? 0 };
}
