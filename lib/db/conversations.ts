import "server-only";
import { lagosStamp } from "@/lib/format";
import type { AttentionLabel, DeskClassName, DeskConversation } from "@/lib/desk/types";
import { schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { claimStatusLabel } from "@/lib/db/labels";

type ConversationRow = {
  id: string;
  title: string;
  summary: string;
  narrative: string[] | null;
  started_at: string | null;
  engagement: Record<string, unknown> | null;
  desk_note: string | null;
  origin: "demo" | "live";
  topics: { name: string } | { name: string }[] | null;
  conversation_entities: { political_entities: { name: string } | { name: string }[] | null }[] | null;
  claims: { id: string; claim_text: string; status: string }[] | null;
};

const conversationSelect = `
  id, title, summary, narrative, started_at, engagement, desk_note, origin,
  topics ( name ),
  conversation_entities ( political_entities ( name ) ),
  claims ( id, claim_text, status )
`;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const velocities = new Set(["Normal", "Growing", "Rapid", "Breaking"]);
const attentionLabels = new Set<AttentionLabel>(["Emerging", "Growing", "High attention"]);
const deskClasses = new Set<DeskClassName>(["actionable", "discussion", "noise"]);

export function toConversation(row: ConversationRow): DeskConversation {
  const velocity = typeof row.engagement?.velocity === "string" && velocities.has(row.engagement.velocity) ? row.engagement.velocity : null;
  const attention = typeof row.engagement?.attention === "string" && attentionLabels.has(row.engagement.attention as AttentionLabel) ? (row.engagement.attention as AttentionLabel) : null;
  const deskClass = typeof row.engagement?.deskClass === "string" && deskClasses.has(row.engagement.deskClass as DeskClassName) ? (row.engagement.deskClass as DeskClassName) : null;
  return {
    id: row.id,
    title: row.title,
    topic: one(row.topics)?.name || "Unsorted",
    attention,
    deskClass,
    summary: row.summary,
    narrative: row.narrative ?? [],
    volume: numberOrNull(row.engagement?.volume),
    growthPct: numberOrNull(row.engagement?.growthPct),
    velocity: velocity as DeskConversation["velocity"],
    velocityNote: typeof row.engagement?.velocityNote === "string" ? row.engagement.velocityNote : null,
    firstDetected: lagosStamp(row.started_at),
    entities: (row.conversation_entities ?? []).flatMap((item) => {
      const entity = one(item.political_entities);
      return entity ? [entity.name] : [];
    }),
    relatedClaims: (row.claims ?? []).map((claim) => ({
      id: claim.id,
      claim: claim.claim_text,
      status: claimStatusLabel(claim.status),
    })),
    deskNote: row.desk_note,
    origin: row.origin,
    postCount: numberOrNull(row.engagement?.postCount),
  };
}

export async function listConversations() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { data, error } = await db.from("conversations").select(conversationSelect).neq("status", "closed").order("started_at", { ascending: false });
  if (error) return { ok: false as const, reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const), message: scrubDbMessage(error.message) };
  const classOrder: Record<DeskClassName, number> = { actionable: 0, discussion: 1, noise: 2 };
  const conversations = ((data ?? []) as unknown as ConversationRow[]).map(toConversation);
  conversations.sort((left, right) => classOrder[left.deskClass ?? "discussion"] - classOrder[right.deskClass ?? "discussion"]);
  return { ok: true as const, conversations };
}
