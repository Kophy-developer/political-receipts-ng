import { contentPillarFromStorage, type ContentPillar } from "@/lib/pillars/catalog";

export type PacketPost = {
  text: string;
  handle: string | null;
  postedAt: string | null;
  relationship: string | null;
};

export type ConversationPacket = {
  id: string;
  pillar: ContentPillar;
  posts: PacketPost[];
};

export type StoredAssessmentPost = {
  text: string | null;
  username: string | null;
  postedAt: string | null;
  conversationId: string;
  referenced?: unknown;
  contentPillar?: string | null;
};

const relationships = new Set(["replied_to", "quoted", "retweeted"]);

function relationshipOf(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    if (typeof type === "string" && relationships.has(type)) return type;
  }
  return null;
}

function handleOf(username: string | null) {
  const clean = username?.replace(/^@/, "").trim() ?? "";
  return clean ? `@${clean}` : null;
}

export function packetsFromPosts(rows: StoredAssessmentPost[]): ConversationPacket[] {
  const grouped = new Map<string, StoredAssessmentPost[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.conversationId) ?? [];
    bucket.push(row);
    grouped.set(row.conversationId, bucket);
  }
  return [...grouped.entries()].map(([id, posts]) => {
    const ordered = posts.slice().sort((left, right) => (left.postedAt ?? "").localeCompare(right.postedAt ?? ""));
    const pillars = ordered.map((post) => contentPillarFromStorage(post.contentPillar)).filter((pillar): pillar is ContentPillar => pillar !== null);
    const pillar = pillars.find((item) => item !== "politics") ?? pillars[0] ?? "politics";
    return {
      id,
      pillar,
      posts: ordered.flatMap((post) => {
        const text = post.text?.trim() ?? "";
        if (!text) return [];
        return [{
          text,
          handle: handleOf(post.username),
          postedAt: post.postedAt,
          relationship: relationshipOf(post.referenced),
        }];
      }),
    };
  });
}

export function packetChars(packet: ConversationPacket) {
  return packet.posts.reduce((sum, post) => sum + post.text.length + (post.handle?.length ?? 0) + 40, 80);
}

/** One request for a normal saved scan. A packet is split off only when the combined text would be too large. */
export const assessmentBatchLimit = 24_000;

export function assessmentBatches(packets: ConversationPacket[], limit = assessmentBatchLimit) {
  const batches: ConversationPacket[][] = [];
  let current: ConversationPacket[] = [];
  let size = 0;
  for (const packet of packets) {
    const weight = packetChars(packet);
    if (current.length > 0 && size + weight > limit) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(packet);
    size += weight;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function fullConversationText(packet: ConversationPacket) {
  return packet.posts.map((post) => post.text).join("\n\n");
}
