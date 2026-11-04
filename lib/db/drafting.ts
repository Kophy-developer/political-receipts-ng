import "server-only";
import { contentHash } from "@/lib/desk/hash";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { savedDraftFields, styleMeta, type DraftPiece, type StoredDraft } from "@/lib/drafts/rules";

export type { StoredDraft };

type DraftRow = {
  id: string;
  version: string;
  content: string;
  style: string;
  suggested_hashtag: string | null;
  status: string;
  editor_modified: boolean;
  selected?: boolean | null;
  generation_metadata: { source?: string; parts?: unknown; provider?: string } | null;
};

function partsOf(row: DraftRow) {
  const parts = row.generation_metadata?.parts;
  if (Array.isArray(parts) && parts.every((part) => typeof part === "string")) return parts as string[];
  return row.content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

export function toStoredDraft(row: DraftRow): StoredDraft | null {
  if (row.generation_metadata?.source !== "editor-draft") return null;
  const meta = styleMeta(row.style);
  return {
    id: row.id,
    style: row.style,
    version: row.version,
    label: meta?.label ?? `Version ${row.version}`,
    text: row.content,
    parts: partsOf(row),
    hashtag: row.suggested_hashtag === "#CheckAm" ? "#CheckAm" : null,
    selected: row.selected === true,
    editorModified: row.editor_modified,
    status: row.status,
    provider: row.generation_metadata?.provider === "groq" || row.generation_metadata?.provider === "openrouter" || row.generation_metadata?.provider === "gemini"
      ? row.generation_metadata.provider
      : "editor",
  };
}

export async function loadClaimDrafts(claimId: string) {
  const db = serviceClient();
  if (!db) return [];
  const { data, error } = await db
    .from("drafts")
    .select("id, version, content, style, suggested_hashtag, status, editor_modified, selected, generation_metadata")
    .eq("claim_id", claimId)
    .order("version");
  if (error || !data) return [];
  return (data as DraftRow[]).flatMap((row) => {
    const draft = toStoredDraft(row);
    return draft ? [draft] : [];
  });
}

async function writePiece(claimId: string, piece: DraftPiece, input: { provider: "groq" | "openrouter" | "gemini" | "editor"; model: string | null; editorModified: boolean }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const fields = savedDraftFields(piece, input);
  const existing = await db.from("drafts").select("id, selected").eq("claim_id", claimId).eq("version", piece.version).maybeSingle();
  if (existing.error) return { ok: false as const, message: scrubDbMessage(existing.error.message) };
  const row = {
    ...fields,
    content_hash: contentHash(piece.text),
    selected: existing.data?.selected === true,
  };
  if (existing.data?.id) {
    const updated = await db.from("drafts").update(row).eq("id", existing.data.id).eq("claim_id", claimId).select("id").maybeSingle();
    if (updated.error || !updated.data) return { ok: false as const, message: scrubDbMessage(updated.error?.message || "draft") };
    return { ok: true as const, id: updated.data.id as string };
  }
  const inserted = await db.from("drafts").insert({ ...row, claim_id: claimId }).select("id").single();
  if (inserted.error || !inserted.data) return { ok: false as const, message: scrubDbMessage(inserted.error?.message || "draft") };
  return { ok: true as const, id: inserted.data.id as string };
}

export async function storeGeneratedDrafts(claimId: string, pieces: DraftPiece[], source: { provider: "groq" | "openrouter" | "gemini"; model: string | null }) {
  const ids: string[] = [];
  for (const piece of pieces) {
    const saved = await writePiece(claimId, piece, { provider: source.provider, model: source.model, editorModified: false });
    if (!saved.ok) return saved;
    ids.push(saved.id);
  }
  if (ids.length) {
    await recordEvent({ action: "draft generated", actor: "editor", subjectType: "claim", subjectId: claimId, detail: { styles: pieces.map((piece) => piece.style).join(",") } });
  }
  return { ok: true as const, ids };
}

export async function storeEditorDraft(claimId: string, piece: DraftPiece) {
  const saved = await writePiece(claimId, piece, { provider: "editor", model: null, editorModified: true });
  if (!saved.ok) return saved;
  await recordEvent({ action: "draft edited", actor: "editor", subjectType: "draft", subjectId: saved.id, detail: { claimId, manual: true } });
  return saved;
}

export async function saveClaimDraft(input: { claimId: string; draftId: string; piece: DraftPiece }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const fields = savedDraftFields(input.piece, { provider: "editor", model: null, editorModified: true });
  const { data, error } = await db
    .from("drafts")
    .update({
      content: fields.content,
      content_hash: contentHash(input.piece.text),
      character_count: fields.character_count,
      suggested_hashtag: fields.suggested_hashtag,
      editor_modified: true,
      status: "draft",
      generation_metadata: fields.generation_metadata,
    })
    .eq("id", input.draftId)
    .eq("claim_id", input.claimId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "draft") };
  await recordEvent({ action: "draft edited", actor: "editor", subjectType: "draft", subjectId: data.id, detail: { claimId: input.claimId } });
  return { ok: true as const, id: data.id as string };
}

export async function selectClaimDraft(claimId: string, draftId: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const clear = await db.from("drafts").update({ selected: false }).eq("claim_id", claimId).eq("selected", true);
  if (clear.error) return { ok: false as const, message: scrubDbMessage(clear.error.message) };
  const chosen = await db.from("drafts").update({ selected: true }).eq("id", draftId).eq("claim_id", claimId).select("id").maybeSingle();
  if (chosen.error || !chosen.data) return { ok: false as const, message: "That draft is not on this claim." };
  return { ok: true as const };
}
