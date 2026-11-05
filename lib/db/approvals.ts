import "server-only";
import { characterCount, POST_LIMIT } from "@/lib/format";
import { contentHash } from "@/lib/desk/hash";
import { editorActor } from "@/lib/db/identity";
import { checklist } from "@/lib/system";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { isUuid } from "@/lib/db/labels";

export function checklistComplete(checks: unknown) {
  if (!checks || typeof checks !== "object") return false;
  const row = checks as Record<string, unknown>;
  return checklist.every((item) => row[item.id] === true);
}

export async function invalidateActiveApprovals(draftId: string, reason: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const { data, error } = await db
    .from("publish_approvals")
    .update({
      status: "invalidated",
      invalidated_at: new Date().toISOString(),
      invalidation_reason: reason.slice(0, 180),
    })
    .eq("draft_id", draftId)
    .eq("status", "active")
    .select("id");
  if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
  for (const row of data ?? []) {
    await recordEvent({
      action: "approval invalidated",
      actor: await editorActor(),
      subjectType: "publish_approval",
      subjectId: row.id,
      detail: { reason: reason.slice(0, 120) },
    });
  }
  return { ok: true as const, count: data?.length ?? 0 };
}

export async function createApproval(input: {
  draftId: string;
  claimId: string;
  text: string;
  checks: unknown;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, status: 503, message: "The database is not configured." };
  if (!isUuid(input.draftId) || !isUuid(input.claimId)) {
    return { ok: false as const, status: 400, message: "The draft is not one this desk can approve." };
  }
  if (!checklistComplete(input.checks)) {
    return { ok: false as const, status: 400, message: "Every checklist line has to be confirmed on the server." };
  }
  const count = characterCount(input.text);
  if (count < 1 || count > POST_LIMIT) {
    return { ok: false as const, status: 400, message: `The post must be 1–${POST_LIMIT} characters.` };
  }
  const { data: draft, error } = await db
    .from("drafts")
    .select("id, claim_id, content, status")
    .eq("id", input.draftId)
    .maybeSingle();
  if (error || !draft) return { ok: false as const, status: 404, message: "That draft is not on the desk." };
  if (draft.claim_id !== input.claimId) return { ok: false as const, status: 400, message: "The draft does not belong to that claim." };
  if (draft.status === "rejected" || draft.status === "held") {
    return { ok: false as const, status: 400, message: "This draft is not cleared for approval." };
  }
  const hash = contentHash(input.text);
  if (draft.content !== input.text) {
    const saved = await db
      .from("drafts")
      .update({
        content: input.text,
        content_hash: hash,
        character_count: count,
        editor_modified: true,
        status: "edited",
      })
      .eq("id", draft.id);
    if (saved.error) return { ok: false as const, status: 502, message: scrubDbMessage(saved.error.message) };
    await recordEvent({ action: "draft edited", actor: await editorActor(), subjectType: "draft", subjectId: draft.id, detail: { claimId: input.claimId } });
  } else {
    const aligned = await db.from("drafts").update({ content_hash: hash, character_count: count }).eq("id", draft.id);
    if (aligned.error) return { ok: false as const, status: 502, message: scrubDbMessage(aligned.error.message) };
  }
  await invalidateActiveApprovals(draft.id, "A new approval replaced the previous one.");
  const review = await db
    .from("editorial_reviews")
    .insert({
      draft_id: draft.id,
      reviewer_name: await editorActor(),
      checklist: input.checks,
      reviewed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (review.error || !review.data) return { ok: false as const, status: 502, message: scrubDbMessage(review.error?.message || "review") };
  await recordEvent({ action: "review completed", actor: await editorActor(), subjectType: "editorial_review", subjectId: review.data.id, detail: { draftId: draft.id } });
  const approval = await db
    .from("publish_approvals")
    .insert({
      draft_id: draft.id,
      review_id: review.data.id,
      approved_text: input.text,
      approved_text_hash: hash,
      draft_content_hash: hash,
      reviewer_name: await editorActor(),
      status: "active",
    })
    .select("id")
    .single();
  if (approval.error || !approval.data) return { ok: false as const, status: 502, message: scrubDbMessage(approval.error?.message || "approval") };
  await recordEvent({
    action: "approval created",
    actor: await editorActor(),
    subjectType: "publish_approval",
    subjectId: approval.data.id,
    detail: { draftId: draft.id, claimId: input.claimId },
  });
  return { ok: true as const, approvalId: approval.data.id as string };
}

export async function readActiveApproval(approvalId: string, text: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, status: 503, message: "The database is not configured." };
  if (!isUuid(approvalId)) return { ok: false as const, status: 400, message: "The approval is not one this desk can publish." };
  const { data, error } = await db
    .from("publish_approvals")
    .select("id, draft_id, approved_text, draft_content_hash, status, editorial_reviews ( checklist )")
    .eq("id", approvalId)
    .maybeSingle();
  if (error || !data) return { ok: false as const, status: 404, message: "That approval is not on the desk." };
  if (data.status !== "active") return { ok: false as const, status: 409, message: "This approval is no longer valid. Open the confirmation again." };
  if (data.approved_text !== text) {
    await invalidateActiveApprovals(data.draft_id, "The text no longer matches the approval.");
    return { ok: false as const, status: 409, message: "The text changed after approval. Approve the new text before sending." };
  }
  const review = data.editorial_reviews as { checklist?: unknown } | { checklist?: unknown }[] | null;
  const checklistRow = Array.isArray(review) ? review[0]?.checklist : review?.checklist;
  if (!checklistComplete(checklistRow)) {
    return { ok: false as const, status: 400, message: "The stored checklist is incomplete." };
  }
  const { data: draft, error: draftError } = await db.from("drafts").select("id, content_hash, claim_id").eq("id", data.draft_id).maybeSingle();
  if (draftError || !draft) return { ok: false as const, status: 404, message: "The approved draft is missing." };
  if (draft.content_hash !== data.draft_content_hash) {
    await invalidateActiveApprovals(draft.id, "The draft changed after approval.");
    return { ok: false as const, status: 409, message: "Editing the draft invalidated this approval." };
  }
  return { ok: true as const, approvalId: data.id as string, draftId: draft.id as string, claimId: draft.claim_id as string };
}
