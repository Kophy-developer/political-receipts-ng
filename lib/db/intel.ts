import "server-only";
import type { ResearchCard } from "@/lib/desk/types";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { claimStatusLabel, confidenceLabel } from "@/lib/db/labels";
import type { TermRule } from "@/lib/intel/relevance";

const intelTables = ["search_groups", "x_posts", "scan_runs", "api_usage", "ai_analyses"];

export type SearchGroup = {
  id: string;
  name: string;
  slug: string;
  query: string;
  topicSlug: string;
  terms: string[];
  anchoredTerms: string[];
};

export async function intelReady() {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured. No X request was made." };
  for (const table of intelTables) {
    const { error } = await db.from(table).select("id").limit(1);
    if (error) {
      const missing = schemaMissing(error.message);
      return {
        ok: false as const,
        message: missing
          ? "The intelligence tables are not installed. No X request was made."
          : "The desk could not read the intelligence tables. No X request was made.",
      };
    }
  }
  return { ok: true as const, db };
}

export async function nextSearchGroup(): Promise<SearchGroup | null> {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("search_groups")
    .select("id, name, slug, query, topic_slug, terms, anchored_terms")
    .eq("enabled", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    query: data.query,
    topicSlug: data.topic_slug,
    terms: data.terms ?? [],
    anchoredTerms: data.anchored_terms ?? [],
  };
}

export async function termRules(): Promise<TermRule[]> {
  const db = serviceClient();
  if (!db) return [];
  const { data, error } = await db.from("search_groups").select("terms, anchored_terms").eq("enabled", true);
  if (error || !data) return [];
  const rules: TermRule[] = [];
  for (const row of data) {
    const anchored = new Set((row.anchored_terms ?? []).map((term: string) => term.toLowerCase()));
    for (const term of row.terms ?? []) {
      if (typeof term !== "string" || !term.trim()) continue;
      rules.push({ term: term.trim(), anchored: anchored.has(term.toLowerCase()) });
    }
  }
  return rules;
}

export async function touchGroup(id: string) {
  const db = serviceClient();
  if (!db) return;
  await db.from("search_groups").update({ last_used_at: new Date().toISOString() }).eq("id", id);
}

export async function topicIdFor(slug: string) {
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db.from("topics").select("id, name").eq("slug", slug).maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
}

export async function knownEntities() {
  const db = serviceClient();
  if (!db) return [] as Array<{ id: string; name: string }>;
  const { data } = await db.from("political_entities").select("id, name").eq("status", "active");
  return (data ?? []).flatMap((row) => (row.name ? [{ id: row.id as string, name: row.name as string }] : []));
}

export async function releaseStaleScans() {
  const db = serviceClient();
  if (!db) return;
  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await db
    .from("scan_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error: "The scan did not finish." })
    .eq("status", "running")
    .lt("started_at", cutoff);
}

export async function openScan(detail: Record<string, unknown>) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const { data, error } = await db.from("scan_runs").insert({ status: "running", detail }).select("id").single();
  if (error?.code === "23505") return { ok: false as const, message: "A scan is already running. No second X request was made." };
  if (error || !data) return { ok: false as const, message: scrubDbMessage(error?.message || "The scan could not start.") };
  return { ok: true as const, id: data.id as string };
}

export async function finishScan(id: string, patch: Record<string, unknown>) {
  const db = serviceClient();
  if (!db) return;
  await db.from("scan_runs").update(patch).eq("id", id);
}

export async function existingPostIds(ids: string[]) {
  const db = serviceClient();
  if (!db || ids.length === 0) return new Set<string>();
  const { data } = await db.from("x_posts").select("x_post_id").in("x_post_id", ids);
  return new Set((data ?? []).map((row) => row.x_post_id as string));
}

export async function savePosts(rows: Record<string, unknown>[]) {
  const db = serviceClient();
  if (!db || rows.length === 0) return true;
  const { error } = await db.from("x_posts").upsert(rows, { onConflict: "x_post_id" });
  return !error;
}

export async function saveConversation(input: {
  externalId: string;
  topicId: string | null;
  title: string;
  summary: string;
  narrative: string[];
  startedAt: string | null;
  lastDetectedAt: string | null;
  postCount: number;
  engagement: Record<string, unknown>;
  entityIds: string[];
}) {
  const db = serviceClient();
  if (!db) return null;
  const { data: existing } = await db.from("conversations").select("id").eq("external_id", input.externalId).maybeSingle();
  const payload = {
    topic_id: input.topicId,
    title: input.title,
    summary: input.summary,
    narrative: input.narrative,
    platform: "x",
    external_id: input.externalId,
    status: "open",
    started_at: input.startedAt,
    last_detected_at: input.lastDetectedAt,
    post_count: input.postCount,
    engagement: input.engagement,
    desk_note: "Filed by a manual scan. This is not a verdict, and it is not a candidate ranking.",
    origin: "live",
  };
  let id = existing?.id as string | undefined;
  let created = false;
  if (id) {
    const { error } = await db.from("conversations").update(payload).eq("id", id);
    if (error) return null;
  } else {
    const { data, error } = await db.from("conversations").insert(payload).select("id").single();
    if (error || !data) return null;
    id = data.id as string;
    created = true;
  }
  if (input.entityIds.length > 0) {
    await db.from("conversation_entities").upsert(
      input.entityIds.map((entityId) => ({ conversation_id: id, entity_id: entityId })),
      { onConflict: "conversation_id,entity_id" },
    );
  }
  return { id, created };
}

export async function attachPosts(postIds: string[], conversationId: string) {
  const db = serviceClient();
  if (!db || postIds.length === 0) return;
  await db.from("x_posts").update({ conversation_id: conversationId }).in("x_post_id", postIds);
}

export async function claimExists(postId: string, claimText: string) {
  const db = serviceClient();
  if (!db) return true;
  const { data } = await db.from("claims").select("id").eq("original_post_id", postId).eq("claim_text", claimText).maybeSingle();
  return Boolean(data);
}

export async function saveClaim(row: Record<string, unknown>) {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db.from("claims").insert(row).select("id").single();
  if (error || !data) return null;
  return data.id as string;
}

export async function saveAnalysis(row: { provider: string; model: string; promptVersion: string; scanId: string }) {
  const db = serviceClient();
  if (!db) return;
  await db.from("ai_analyses").insert({
    provider: row.provider,
    model: row.model,
    prompt_version: row.promptVersion,
    subject_type: "scan",
    subject_id: row.scanId,
  });
}

const importanceLabel = { high: "High", medium: "Medium", low: "Low" } as const;

export async function listResearchQueue() {
  const db = serviceClient();
  if (!db) return { installed: false, cards: [] as ResearchCard[] };
  const { data, error } = await db
    .from("claims")
    .select(
      "id, claim_text, original_author, original_author_username, original_post_url, status, importance, importance_reason, ai_confidence, mentioned_entities, engagement, origin, detected_at, topics ( name )",
    )
    .eq("origin", "live")
    .in("status", ["new", "researching"])
    .not("importance", "is", null)
    .order("detected_at", { ascending: false })
    .limit(40);
  if (error) return { installed: !(schemaMissing(error.message) || columnMissing(error.message)), cards: [] as ResearchCard[] };
  const cards: ResearchCard[] = [];
  for (const row of data ?? []) {
    let importance: "high" | "medium" | "low" | null = null;
    if (row.importance === "high" || row.importance === "medium" || row.importance === "low") importance = row.importance;
    if (!importance) continue;
    const engagement = (row.engagement ?? {}) as Record<string, unknown>;
    const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
    const url = typeof row.original_post_url === "string" && row.original_post_url.startsWith("https://") ? row.original_post_url : null;
    cards.push({
      id: row.id,
      claim: row.claim_text,
      speaker: row.original_author || "Unknown account",
      handle: row.original_author_username ? `@${String(row.original_author_username).replace(/^@/, "")}` : "—",
      postUrl: url,
      topic: topic?.name || "Unsorted",
      entities: Array.isArray(row.mentioned_entities) ? row.mentioned_entities.filter((item: unknown): item is string => typeof item === "string") : [],
      conversationSize: typeof engagement.conversationPosts === "number" ? engagement.conversationPosts : 1,
      engagement: typeof engagement.volume === "number" ? engagement.volume : 0,
      importance: importanceLabel[importance],
      importanceReason: row.importance_reason || "Ranked from public signals only.",
      status: claimStatusLabel(row.status),
      aiConfidence: confidenceLabel(row.ai_confidence),
      origin: row.origin === "demo" ? "demo" : "live",
    });
  }
  const order = { High: 0, Medium: 1, Low: 2 };
  cards.sort((a, b) => order[a.importance] - order[b.importance]);
  return { installed: true, cards };
}

export async function setClaimDeskStatus(id: string, action: "dismiss" | "investigate") {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (action === "dismiss") {
    const { data, error } = await db
      .from("claims")
      .update({ status: "dismissed" })
      .eq("id", id)
      .in("status", ["new", "researching"])
      .select("id")
      .maybeSingle();
    if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
    if (!data) return { ok: false as const, message: "That claim is no longer on the research queue." };
    await recordEvent({ action: "claim dismissed", actor: "editor", subjectType: "claim", subjectId: id });
    return { ok: true as const };
  }
  const { error } = await db.from("claims").update({ status: "researching" }).eq("id", id).eq("status", "new");
  if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
  await recordEvent({ action: "claim opened", actor: "editor", subjectType: "claim", subjectId: id });
  return { ok: true as const };
}
