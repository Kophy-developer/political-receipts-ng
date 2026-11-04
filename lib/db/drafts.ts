import "server-only";
import { characterCount } from "@/lib/format";
import { contentHash } from "@/lib/desk/hash";
import type { StudioClaim, StudioPackage, StudioVersion } from "@/lib/desk/types";
import { schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { claimStatusLabel, classificationFor, confidenceLabel, styleIntent } from "@/lib/db/labels";
import { invalidateActiveApprovals } from "@/lib/db/approvals";

type DraftRow = {
  id: string;
  claim_id: string;
  version: "A" | "B" | "C";
  content: string;
  style: string;
  suggested_hashtag: string | null;
  status: string;
  editor_modified: boolean;
  origin: "demo" | "live";
  generation_metadata: { holdReason?: string; source?: string } | null;
  claims: {
    claim_text: string;
    original_author_username: string | null;
    status: string;
    verification_confidence: string | null;
    editor_notes: string | null;
    origin: "demo" | "live";
    topics: { name: string } | null;
    evidence: { sources: { organization: string } | null }[] | null;
  } | null;
};

const draftSelect = `
  id, claim_id, version, content, style, suggested_hashtag, status, editor_modified, origin, generation_metadata,
  claims (
    claim_text, original_author_username, status, verification_confidence, editor_notes, origin,
    topics ( name ),
    evidence ( sources ( organization ) )
  )
`;

export async function listDraftDesk() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { data, error } = await db.from("drafts").select(draftSelect).order("version");
  if (error) return { ok: false as const, reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const) };
  const rows = (data ?? []) as unknown as DraftRow[];
  const claims = new Map<string, StudioClaim>();
  const packages = new Map<string, StudioPackage>();
  for (const row of rows) {
    if (!row.claims) continue;
    if (row.generation_metadata?.source === "editor-draft") continue;
    const status = claimStatusLabel(row.claims.status);
    if (!claims.has(row.claim_id)) {
      claims.set(row.claim_id, {
        id: row.claim_id,
        claim: row.claims.claim_text,
        handle: row.claims.original_author_username ? `@${row.claims.original_author_username.replace(/^@/, "")}` : "—",
        topic: (Array.isArray(row.claims.topics) ? row.claims.topics[0]?.name : row.claims.topics?.name) || "Unsorted",
        status,
        confidence: confidenceLabel(row.claims.verification_confidence),
        classification: classificationFor(status),
        evidenceOrgs: (row.claims.evidence ?? []).flatMap((item) => {
          const source = Array.isArray(item.sources) ? item.sources[0] : item.sources;
          return source ? [source.organization] : [];
        }),
        origin: row.claims.origin,
        note: row.claims.editor_notes || "No editor note has been filed.",
      });
    }
    const version: StudioVersion = {
      id: row.version,
      draftId: row.id,
      label: `Version ${row.version}`,
      intent: styleIntent(row.style),
      text: row.content,
      hashtag: row.suggested_hashtag || "None",
      style: row.style,
      status: row.status,
      editorModified: row.editor_modified,
    };
    const existing = packages.get(row.claim_id);
    const ready = row.status === "ready" || row.status === "edited";
    const holdReason = row.generation_metadata?.holdReason || (row.status === "held" ? "This package is held." : null);
    if (!existing) {
      packages.set(row.claim_id, {
        claimId: row.claim_id,
        ready,
        holdReason: ready ? null : holdReason,
        origin: row.origin,
        versions: [version],
      });
    } else {
      existing.versions.push(version);
      existing.ready = existing.ready || ready;
      if (existing.ready) existing.holdReason = null;
    }
  }
  for (const pack of packages.values()) {
    pack.versions.sort((a, b) => a.id.localeCompare(b.id));
  }
  return { ok: true as const, claims: [...claims.values()], packages: [...packages.values()] };
}

export async function saveDraftEdit(input: { draftId: string; content: string; actor: string }) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const count = characterCount(input.content);
  if (count < 1) return { ok: false as const, message: "The draft text is empty." };
  const hash = contentHash(input.content);
  const { data, error } = await db
    .from("drafts")
    .update({
      content: input.content,
      content_hash: hash,
      character_count: count,
      editor_modified: true,
      status: "edited",
    })
    .eq("id", input.draftId)
    .select("id, claim_id")
    .maybeSingle();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "missing") };
  await invalidateActiveApprovals(input.draftId, "The draft was edited after approval.");
  await recordEvent({ action: "draft edited", actor: input.actor, subjectType: "draft", subjectId: data.id, detail: { claimId: data.claim_id } });
  return { ok: true as const };
}
