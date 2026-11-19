import "server-only";
import { saveFinalPost } from "@/lib/db/final-post";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { loadStoredCapability } from "@/lib/db/connections";
import { composeEvidencePost, parseHttpsUrl, parseOptionalHttpsUrl } from "@/lib/publish/evidence";
import { noticeFor, readyItemFromRow } from "@/lib/publisher/read";
import { parseApprovalText } from "@/lib/publisher/rephrase";
import type { ReadyItem } from "@/lib/publisher/types";

function claimText(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return claimText(value[0]);
  if (typeof value === "object" && "claim_text" in value) {
    const text = (value as { claim_text?: unknown }).claim_text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

export async function listReadyForApproval(): Promise<{ items: ReadyItem[]; notice: ReturnType<typeof noticeFor> }> {
  const db = serviceClient();
  if (!db) return { items: [], notice: noticeFor(0) };
  const listed = await db
    .from("opportunities")
    .select("id, claim_id, content_pillar, what_happened, possible_angle, development, updated_at, claims ( claim_text, original_post_id, original_post_url, original_author_username )")
    .eq("lifecycle", "READY_FOR_EDITOR")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (listed.error || !listed.data) return { items: [], notice: noticeFor(0) };
  const items = listed.data.flatMap((row) => {
    const claimId = typeof row.claim_id === "string" ? row.claim_id : "";
    const claimRow = Array.isArray(row.claims) ? row.claims[0] : row.claims;
    const claim = claimText(row.claims) ?? (typeof row.what_happened === "string" ? row.what_happened : "Ready draft");
    const replyToPostId = claimRow && typeof claimRow === "object" && typeof (claimRow as { original_post_id?: unknown }).original_post_id === "string"
      ? (claimRow as { original_post_id: string }).original_post_id
      : null;
    const replyToUrl = claimRow && typeof claimRow === "object" && typeof (claimRow as { original_post_url?: unknown }).original_post_url === "string"
      ? (claimRow as { original_post_url: string }).original_post_url
      : null;
    const replyToUsername = claimRow && typeof claimRow === "object" && typeof (claimRow as { original_author_username?: unknown }).original_author_username === "string"
      ? (claimRow as { original_author_username: string }).original_author_username
      : null;
    const item = readyItemFromRow({
      id: String(row.id),
      claimId,
      pillar: typeof row.content_pillar === "string" ? row.content_pillar : null,
      claim,
      whatHappened: typeof row.what_happened === "string" ? row.what_happened : null,
      possibleAngle: typeof row.possible_angle === "string" ? row.possible_angle : null,
      development: row.development,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      replyToPostId,
      replyToUrl,
      replyToUsername,
    });
    return item ? [item] : [];
  });
  return { items, notice: noticeFor(items.length) };
}

export async function prepareApprovalDraft(input: {
  opportunityId: string;
  text: string;
  evidenceUrl?: unknown;
  mediaUrl?: unknown;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const row = await db
    .from("opportunities")
    .select("id, claim_id, lifecycle, development")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (row.error || !row.data || typeof row.data.claim_id !== "string") {
    return { ok: false as const, message: "That draft is not on the approval queue." };
  }
  if (row.data.lifecycle !== "READY_FOR_EDITOR") {
    return { ok: false as const, message: "That draft is no longer waiting for approval." };
  }
  const item = readyItemFromRow({
    id: String(row.data.id),
    claimId: row.data.claim_id,
    pillar: null,
    claim: "",
    whatHappened: null,
    possibleAngle: null,
    development: row.data.development,
    updatedAt: null,
  });
  if (!item) return { ok: false as const, message: "That draft is not on the approval queue." };
  const parsed = parseApprovalText(input.text);
  if (!parsed.ok) return parsed;
  const evidence = parseHttpsUrl(input.evidenceUrl ?? item.sourceUrl);
  if (!evidence.ok) return evidence;
  const media = parseOptionalHttpsUrl(input.mediaUrl);
  if (!media.ok) return media;
  const capability = await loadStoredCapability();
  const composed = composeEvidencePost({
    text: parsed.text,
    evidenceUrl: evidence.url,
    maximum: capability.maximum,
  });
  if (!composed.ok) return composed;
  const sources = [evidence.url, media.url, item.sourceUrl, item.chartUrl]
    .flatMap((url) => (url ? [url] : []))
    .filter((url, index, list) => list.indexOf(url) === index);
  const saved = await saveFinalPost({
    claimId: row.data.claim_id,
    text: composed.text,
    sources,
    evidenceUrl: evidence.url,
    mediaUrl: media.url,
  });
  if (!saved.ok) return saved;
  return {
    ok: true as const,
    claimId: row.data.claim_id,
    draftId: saved.id,
    text: saved.text,
    evidenceUrl: evidence.url,
    mediaUrl: media.url,
  };
}

export async function rejectReadyDraft(input: { opportunityId: string; reason?: string }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const reason = (input.reason?.trim() || "Rejected from the approval queue.").slice(0, 180);
  const updated = await db
    .from("opportunities")
    .update({
      status: "ignored",
      lifecycle: "PASSED",
      queue_rank: null,
      pass_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.opportunityId)
    .eq("lifecycle", "READY_FOR_EDITOR")
    .select("id")
    .maybeSingle();
  if (updated.error) return { ok: false as const, message: scrubDbMessage(updated.error.message) };
  if (!updated.data) return { ok: false as const, message: "That draft is no longer waiting for approval." };
  return { ok: true as const, message: "Rejected. It will not be published." };
}

export async function markPublishedOpportunity(claimId: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured. The post may still be on X." };
  const updated = await db
    .from("opportunities")
    .update({
      lifecycle: "PUBLISHED",
      status: "saved",
      queue_rank: null,
      updated_at: new Date().toISOString(),
    })
    .eq("claim_id", claimId)
    .eq("lifecycle", "READY_FOR_EDITOR")
    .select("id");
  if (updated.error) return { ok: false as const, message: scrubDbMessage(updated.error.message) };
  if (!updated.data?.length) {
    return { ok: false as const, message: "The post went out, but the queue could not mark this draft published." };
  }
  return { ok: true as const, count: updated.data.length };
}
