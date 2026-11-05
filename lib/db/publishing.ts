import "server-only";
import { editorialTagIn } from "@/lib/desk/tag";
import { editorActor } from "@/lib/db/identity";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { storedPillarForPublished, withoutStoredPillar } from "@/lib/db/pillars";
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
    actor: await editorActor(),
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
  text: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const pillar = await storedPillarForPublished(input.rowId);
  const patch = {
    x_post_id: input.xPostId,
    x_post_url: input.xPostUrl,
    published_at: new Date().toISOString(),
    status: "published",
    editorial_tag: editorialTagIn(input.text),
    response_metadata: { id: input.xPostId },
    ...(pillar ? { content_pillar: pillar } : {}),
  };
  let posted = await db.from("published_posts").update(patch).eq("id", input.rowId);
  if (posted.error && pillar && columnMissing(posted.error.message)) {
    posted = await db.from("published_posts").update(withoutStoredPillar(patch)).eq("id", input.rowId);
  }
  if (posted.error) return { ok: false as const, message: scrubDbMessage(posted.error.message) };
  await db.from("publish_approvals").update({ status: "published" }).eq("id", input.approvalId).eq("status", "active");
  await recordEvent({
    action: "publish succeeded",
    actor: await editorActor(),
    subjectType: "published_post",
    subjectId: input.rowId,
    detail: { approvalId: input.approvalId, xPostId: input.xPostId },
  });
  return { ok: true as const };
}

export type ClaimPublication = {
  url: string | null;
  publishedAt: string;
};

export async function publishedByClaim() {
  const found = new Map<string, ClaimPublication>();
  const db = serviceClient();
  if (!db) return found;
  const posts = await db
    .from("published_posts")
    .select("draft_id, x_post_url, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (posts.error || !posts.data?.length) return found;
  const draftIds = posts.data.map((row) => row.draft_id).filter((id): id is string => typeof id === "string");
  if (!draftIds.length) return found;
  const drafts = await db.from("drafts").select("id, claim_id").in("id", draftIds);
  if (drafts.error || !drafts.data) return found;
  const claimOf = new Map(drafts.data.map((row) => [row.id as string, row.claim_id as string]));
  for (const row of posts.data) {
    const claimId = claimOf.get(row.draft_id as string);
    if (!claimId || found.has(claimId)) continue;
    found.set(claimId, {
      url: typeof row.x_post_url === "string" ? row.x_post_url : null,
      publishedAt: typeof row.published_at === "string" ? row.published_at : "",
    });
  }
  return found;
}

export async function failPublication(rowId: string, approvalId: string) {
  const db = serviceClient();
  if (!db) return;
  await db.from("published_posts").update({ status: "failed" }).eq("id", rowId).eq("status", "pending");
  await recordEvent({
    action: "publish failed",
    actor: await editorActor(),
    subjectType: "published_post",
    subjectId: rowId,
    detail: { approvalId },
  });
}
