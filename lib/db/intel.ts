import "server-only";
import type { ResearchCard } from "@/lib/desk/types";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { recordEvent } from "@/lib/db/events";
import { claimStatusLabel, confidenceLabel } from "@/lib/db/labels";
import type { TermRule } from "@/lib/intel/relevance";
import { pickSearchGroup, type StoredGroup } from "@/lib/pillars/groups";

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

function toSearchGroup(data: {
  id: string;
  name: string;
  slug: string;
  query: string;
  topic_slug: string;
  terms: string[] | null;
  anchored_terms: string[] | null;
}): SearchGroup {
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

export async function nextSearchGroupForPillar(pillar: "politics" | "finance" | "football"): Promise<SearchGroup | null> {
  const db = serviceClient();
  if (!db) return null;
  const ranked = await db
    .from("search_groups")
    .select("id, name, slug, query, topic_slug, terms, anchored_terms, rotation_order, last_used_at, enabled, content_pillar")
    .eq("enabled", true)
    .eq("content_pillar", pillar);
  if (ranked.error) return pillar === "politics" ? nextSearchGroup() : null;
  const picked = pickSearchGroup((ranked.data ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    query: String(row.query),
    pillar,
    enabled: row.enabled !== false,
    lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
    rotation: typeof row.rotation_order === "number" ? row.rotation_order : 0,
  } satisfies StoredGroup)), pillar);
  const row = (ranked.data ?? []).find((item) => item.slug === picked?.slug);
  return row ? toSearchGroup(row) : null;
}

export async function nextSearchGroup(): Promise<SearchGroup | null> {
  const db = serviceClient();
  if (!db) return null;
  const ranked = await db
    .from("search_groups")
    .select("id, name, slug, query, topic_slug, terms, anchored_terms, rotation_order")
    .eq("enabled", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .order("rotation_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ranked.error && ranked.data) return toSearchGroup(ranked.data);
  if (ranked.error && !columnMissing(ranked.error.message)) return null;
  const fallback = await db
    .from("search_groups")
    .select("id, name, slug, query, topic_slug, terms, anchored_terms")
    .eq("enabled", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fallback.error || !fallback.data) return null;
  return toSearchGroup(fallback.data);
}

export async function listSearchGroups() {
  const db = serviceClient();
  if (!db) return [] as Array<{ name: string; topicSlug: string }>;
  const { data } = await db.from("search_groups").select("name, topic_slug");
  return (data ?? []).flatMap((row) => (row.name && row.topic_slug ? [{ name: row.name as string, topicSlug: row.topic_slug as string }] : []));
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
  if (!db) return [] as Array<{ id: string; name: string; aliases: string[] }>;
  const primary = await db.from("political_entities").select("id, name, aliases").eq("status", "active");
  const data = primary.error && columnMissing(primary.error.message)
    ? (await db.from("political_entities").select("id, name").eq("status", "active")).data
    : primary.data;
  return (data ?? []).flatMap((row) =>
    row.name
      ? [{
          id: row.id as string,
          name: row.name as string,
          aliases: "aliases" in row && Array.isArray(row.aliases) ? row.aliases.filter((alias: unknown): alias is string => typeof alias === "string") : [],
        }]
      : [],
  );
}

export async function loadScanPosts(scanId: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const { data, error } = await db
    .from("x_posts")
    .select("x_post_id, text, author_id, username, display_name, posted_at, public_metrics, x_conversation_id, referenced, language, source_query, relevance, relevance_reason, desk_class, content_pillar")
    .eq("scan_id", scanId);
  if (error) return { ok: false as const, message: "Stored posts could not be read." };
  return { ok: true as const, rows: data ?? [] };
}

export async function loadStoredPosts() {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const { data, error } = await db
    .from("x_posts")
    .select("x_post_id, text, author_id, username, display_name, posted_at, public_metrics, x_conversation_id, referenced, language, source_query, desk_class")
    .order("posted_at", { ascending: true });
  if (error) return { ok: false as const, message: "Stored posts could not be read." };
  return { ok: true as const, rows: data ?? [] };
}

export async function updateStoredPost(id: string, patch: { text: string; relevance: string; relevance_reason: string; desk_class: string }) {
  const db = serviceClient();
  if (!db) return false;
  const { error } = await db.from("x_posts").update(patch).eq("x_post_id", id);
  return !error;
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
  deskNote?: string;
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
    desk_note: input.deskNote ?? "Filed by a manual scan. This is not a verdict, and it is not a candidate ranking.",
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

export async function findClaimId(postId: string, claimText: string) {
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db.from("claims").select("id").eq("original_post_id", postId).eq("claim_text", claimText).maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

export async function claimExists(postId: string, claimText: string) {
  if (!serviceClient()) return true;
  return (await findClaimId(postId, claimText)) !== null;
}

export async function saveClaim(row: Record<string, unknown>) {
  const db = serviceClient();
  if (!db) return null;
  const { data, error } = await db.from("claims").insert(row).select("id").single();
  if (error || !data) return null;
  return data.id as string;
}

export async function saveAnalysis(row: { provider: string; model: string; promptVersion: string; scanId?: string | null }) {
  const db = serviceClient();
  if (!db) return;
  await db.from("ai_analyses").insert({
    provider: row.provider,
    model: row.model,
    prompt_version: row.promptVersion,
    subject_type: row.scanId ? "scan" : "health",
    subject_id: row.scanId ?? null,
  });
}

export async function closeOrphanConversations(activeIds: string[]) {
  const db = serviceClient();
  if (!db || activeIds.length === 0) return 0;
  const { data } = await db.from("conversations").select("id").eq("origin", "live").eq("status", "open");
  const active = new Set(activeIds);
  const orphans = (data ?? []).map((row) => row.id as string).filter((id) => !active.has(id));
  if (orphans.length === 0) return 0;
  await db
    .from("conversations")
    .update({ status: "closed", desk_note: "Closed when stored posts were reclustered. The posts were not deleted." })
    .in("id", orphans);
  return orphans.length;
}

const importanceLabel = { high: "High", medium: "Medium", low: "Low" } as const;

const queueColumns =
  "id, claim_text, original_author, original_author_username, original_post_url, status, importance, importance_reason, ai_confidence, mentioned_entities, engagement, origin, detected_at, desk_class, topics ( name )";
const queueColumnsFallback =
  "id, claim_text, original_author, original_author_username, original_post_url, status, importance, importance_reason, ai_confidence, mentioned_entities, engagement, origin, detected_at, topics ( name )";

export async function listResearchQueue() {
  const db = serviceClient();
  if (!db) return { installed: false, cards: [] as ResearchCard[] };
  const filters = (columns: string) =>
    db.from("claims").select(columns).eq("origin", "live").in("status", ["new", "researching"]).not("importance", "is", null).order("detected_at", { ascending: false }).limit(40);
  const primary = await filters(queueColumns);
  const result = primary.error && columnMissing(primary.error.message) ? await filters(queueColumnsFallback) : primary;
  if (result.error) return { installed: !(schemaMissing(result.error.message) || columnMissing(result.error.message)), cards: [] as ResearchCard[] };
  const cards: ResearchCard[] = [];
  for (const row of (result.data ?? []) as unknown as Array<Record<string, unknown>>) {
    let importance: "high" | "medium" | "low" | null = null;
    if (row.importance === "high" || row.importance === "medium" || row.importance === "low") importance = row.importance;
    if (!importance) continue;
    const engagement = (row.engagement ?? {}) as Record<string, unknown>;
    const topicValue = row.topics;
    const topic = Array.isArray(topicValue) ? (topicValue[0] as { name?: string } | undefined) : (topicValue as { name?: string } | null);
    const url = typeof row.original_post_url === "string" && row.original_post_url.startsWith("https://") ? row.original_post_url : null;
    const deskClass = row.desk_class === "actionable" || row.desk_class === "discussion" || row.desk_class === "noise" ? row.desk_class : null;
    cards.push({
      id: String(row.id),
      claim: String(row.claim_text ?? ""),
      speaker: typeof row.original_author === "string" && row.original_author ? row.original_author : "Unknown account",
      handle: typeof row.original_author_username === "string" && row.original_author_username ? `@${row.original_author_username.replace(/^@/, "")}` : "—",
      postUrl: url,
      topic: topic?.name || "Unsorted",
      entities: Array.isArray(row.mentioned_entities) ? row.mentioned_entities.filter((item: unknown): item is string => typeof item === "string") : [],
      conversationSize: typeof engagement.conversationPosts === "number" ? engagement.conversationPosts : 1,
      engagement: typeof engagement.volume === "number" ? engagement.volume : 0,
      importance: importanceLabel[importance],
      importanceReason: typeof row.importance_reason === "string" && row.importance_reason ? row.importance_reason : "Ranked from public signals only.",
      status: claimStatusLabel(typeof row.status === "string" ? row.status : ""),
      aiConfidence: confidenceLabel(typeof row.ai_confidence === "string" ? row.ai_confidence : null),
      origin: row.origin === "demo" ? "demo" : "live",
      deskClass,
    });
  }
  const classOrder = { actionable: 0, discussion: 1, noise: 2 };
  const order = { High: 0, Medium: 1, Low: 2 };
  cards.sort((a, b) => (classOrder[a.deskClass ?? "discussion"] - classOrder[b.deskClass ?? "discussion"]) || order[a.importance] - order[b.importance]);
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
