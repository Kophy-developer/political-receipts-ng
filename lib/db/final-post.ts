import "server-only";
import { contentHash } from "@/lib/desk/hash";
import { finalPostRecord, readFinalPost } from "@/lib/desk/story";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { storedPillarForClaim, withoutStoredPillar } from "@/lib/db/pillars";
import { characterCount } from "@/lib/format";

export async function listExactFinalPosts() {
  const found = new Map<string, { id: string; text: string }>();
  const db = serviceClient();
  if (!db) return found;
  const listed = await db.from("drafts").select("id, claim_id, content, generation_metadata").eq("version", "M");
  if (listed.error || !listed.data) return found;
  for (const row of listed.data) {
    if (typeof row.claim_id !== "string" || typeof row.id !== "string") continue;
    const read = readFinalPost({ content: row.content, generation_metadata: row.generation_metadata as { sources?: unknown; source?: unknown; exact?: unknown } | null });
    if (!read.exact) continue;
    found.set(row.claim_id, { id: row.id, text: read.text });
  }
  return found;
}

export async function loadFinalPost(claimId: string) {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("drafts")
    .select("id, content, generation_metadata")
    .eq("claim_id", claimId)
    .eq("version", "M")
    .maybeSingle();
  if (error || !data) return null;
  const read = readFinalPost({ content: data.content, generation_metadata: data.generation_metadata as { sources?: unknown; source?: unknown; exact?: unknown } | null });
  if (!read.exact) return null;
  return { id: data.id as string, text: read.text, sources: read.sources };
}

export async function saveFinalPost(input: { claimId: string; text: string; sources: string[] }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const fields = finalPostRecord(input.text, input.sources);
  const existing = await db.from("drafts").select("id").eq("claim_id", input.claimId).eq("version", "M").maybeSingle();
  if (existing.error) return { ok: false as const, message: scrubDbMessage(existing.error.message) };
  const pillar = await storedPillarForClaim(input.claimId);
  const row = {
    version: fields.version,
    content: fields.content,
    content_hash: contentHash(fields.content),
    style: fields.style,
    suggested_hashtag: fields.suggested_hashtag,
    character_count: characterCount(fields.content),
    status: "draft" as const,
    editor_modified: true,
    origin: "live" as const,
    generation_metadata: fields.generation_metadata,
    ...(pillar ? { content_pillar: pillar } : {}),
  };
  if (existing.data?.id) {
    let updated = await db.from("drafts").update(row).eq("id", existing.data.id).eq("claim_id", input.claimId).eq("version", "M").select("id, content").maybeSingle();
    if (updated.error && pillar && columnMissing(updated.error.message)) {
      updated = await db.from("drafts").update(withoutStoredPillar(row)).eq("id", existing.data.id).eq("claim_id", input.claimId).eq("version", "M").select("id, content").maybeSingle();
    }
    if (updated.error || !updated.data) return { ok: false as const, message: scrubDbMessage(updated.error?.message || "final post") };
    return { ok: true as const, id: updated.data.id as string, text: updated.data.content as string };
  }
  let inserted = await db.from("drafts").insert({ ...row, claim_id: input.claimId }).select("id, content").single();
  if (inserted.error && pillar && columnMissing(inserted.error.message)) {
    inserted = await db.from("drafts").insert({ ...withoutStoredPillar(row), claim_id: input.claimId }).select("id, content").single();
  }
  if (inserted.error || !inserted.data) return { ok: false as const, message: scrubDbMessage(inserted.error?.message || "final post") };
  return { ok: true as const, id: inserted.data.id as string, text: inserted.data.content as string };
}
