import "server-only";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";

const stances = new Set(["supports", "contradicts", "contextualizes"]);

export async function addEvidence(input: {
  claimId: string;
  sourceId: string;
  excerpt: string;
  stance: string;
  notes?: string | null;
  origin?: "demo" | "live";
  actor: string;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!stances.has(input.stance)) return { ok: false as const, message: "Evidence has to support, contradict, or contextualize the claim." };
  const { data, error } = await db
    .from("evidence")
    .insert({
      claim_id: input.claimId,
      source_id: input.sourceId,
      excerpt: input.excerpt,
      stance: input.stance,
      editor_notes: input.notes ?? null,
      origin: input.origin ?? "live",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "insert") };
  await recordEvent({
    action: "evidence added",
    actor: input.actor,
    subjectType: "evidence",
    subjectId: data.id,
    detail: { claimId: input.claimId, stance: input.stance },
  });
  return { ok: true as const, id: data.id as string };
}
