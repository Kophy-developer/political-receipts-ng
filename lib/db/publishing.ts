import "server-only";
import { editor } from "@/lib/system";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";

export async function publishingAccount() {
  const db = serviceClient();
  if (!db) return "desk account";
  const { data } = await db
    .from("x_connections")
    .select("username")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.username ? `@${String(data.username).replace(/^@/, "")}` : "desk account";
}

export async function reservePublication(approvalId: string, draftId: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, status: 503, message: "The database is not configured." };
  const account = await publishingAccount();
  const { data, error } = await db
    .from("published_posts")
    .insert({
      approval_id: approvalId,
      draft_id: draftId,
      publishing_account: account,
      status: "pending",
      response_metadata: {},
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false as const, status: 409, message: "This approval already has a publish attempt. Check X before trying again." };
    }
    return { ok: false as const, status: 502, message: scrubDbMessage(error?.message || "insert") };
  }
  await recordEvent({
    action: "publish attempted",
    actor: editor.name,
    subjectType: "published_post",
    subjectId: data.id,
    detail: { approvalId, draftId },
  });
  return { ok: true as const, id: data.id as string, account };
}

export async function finishPublication(input: {
  rowId: string;
  approvalId: string;
  xPostId: string;
  xPostUrl: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const posted = await db
    .from("published_posts")
    .update({
      x_post_id: input.xPostId,
      x_post_url: input.xPostUrl,
      published_at: new Date().toISOString(),
      status: "published",
      response_metadata: { id: input.xPostId },
    })
    .eq("id", input.rowId);
  if (posted.error) return { ok: false as const, message: scrubDbMessage(posted.error.message) };
  await db.from("publish_approvals").update({ status: "published" }).eq("id", input.approvalId).eq("status", "active");
  await recordEvent({
    action: "publish succeeded",
    actor: editor.name,
    subjectType: "published_post",
    subjectId: input.rowId,
    detail: { approvalId: input.approvalId, xPostId: input.xPostId },
  });
  return { ok: true as const };
}

export async function failPublication(rowId: string, approvalId: string) {
  const db = serviceClient();
  if (!db) return;
  await db.from("published_posts").update({ status: "failed" }).eq("id", rowId).eq("status", "pending");
  await recordEvent({
    action: "publish failed",
    actor: editor.name,
    subjectType: "published_post",
    subjectId: rowId,
    detail: { approvalId },
  });
}
