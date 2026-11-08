import "server-only";
import { columnMissing, serviceClient } from "@/lib/db/client";
import { toSearchGroup, type SearchGroup } from "@/lib/db/intel";
import { queryAudit, selectDiscoveryQuery, type QueryRosterItem, type QuerySelection } from "@/lib/intel/query-library";
import { contentPillars, storagePillar, type ContentPillar } from "@/lib/pillars/catalog";
import type { StoredGroup } from "@/lib/pillars/groups";

export type QueryDesk = {
  audit: typeof queryAudit;
  selections: Record<ContentPillar, QuerySelection | null>;
  rosters: Record<ContentPillar, QueryRosterItem[]>;
};

function blankDesk(): QueryDesk {
  return {
    audit: queryAudit,
    selections: { politics: null, finance: null, manchester_united: null },
    rosters: { politics: [], finance: [], manchester_united: [] },
  };
}

async function preferenceMap(): Promise<Partial<Record<ContentPillar, string>>> {
  const db = serviceClient();
  if (!db) return {};
  const row = await db.from("desk_schedule").select("query_preference").eq("id", "default").maybeSingle();
  if (row.error && columnMissing(row.error.message)) return {};
  const value = row.data?.query_preference;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const saved: Partial<Record<ContentPillar, string>> = {};
  for (const pillar of contentPillars) {
    const slug = (value as Record<string, unknown>)[pillar];
    if (typeof slug === "string" && slug.trim()) saved[pillar] = slug;
  }
  return saved;
}

async function storedGroups(): Promise<StoredGroup[]> {
  const db = serviceClient();
  if (!db) return [];
  const groups = await db.from("search_groups").select("slug, name, query, content_pillar, enabled, last_used_at, rotation_order");
  if (groups.error || !groups.data) return [];
  return groups.data.flatMap((row) => {
    const pillar = row.content_pillar === "football" || row.content_pillar === "finance" || row.content_pillar === "politics" ? row.content_pillar : null;
    if (!pillar || typeof row.slug !== "string" || typeof row.query !== "string" || typeof row.name !== "string") return [];
    return [{
      slug: row.slug,
      name: row.name,
      query: row.query,
      pillar,
      enabled: row.enabled !== false,
      lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
      rotation: typeof row.rotation_order === "number" ? row.rotation_order : 0,
    } satisfies StoredGroup];
  });
}

export async function loadQueryDesk(now = Date.now()): Promise<QueryDesk> {
  const [groups, preference] = await Promise.all([storedGroups(), preferenceMap()]);
  if (groups.length === 0) return blankDesk();
  const desk = blankDesk();
  for (const pillar of contentPillars) {
    const picked = selectDiscoveryQuery({ groups, pillar: storagePillar(pillar), preferenceSlug: preference[pillar] ?? null, now });
    desk.selections[pillar] = picked?.selected ?? null;
    desk.rosters[pillar] = picked?.roster ?? [];
  }
  return desk;
}

export async function selectedSearchGroup(storage: StoredGroup["pillar"], now = Date.now()): Promise<{ group: SearchGroup; selection: QuerySelection } | null> {
  const db = serviceClient();
  if (!db) return null;
  const content = storage === "football" ? "manchester_united" : storage;
  const [groups, preference, rows] = await Promise.all([
    storedGroups(),
    preferenceMap(),
    db.from("search_groups").select("id, name, slug, query, topic_slug, terms, anchored_terms").eq("enabled", true).eq("content_pillar", storage),
  ]);
  if (rows.error || !rows.data) return null;
  const picked = selectDiscoveryQuery({ groups, pillar: storage, preferenceSlug: preference[content] ?? null, now });
  if (!picked) return null;
  const row = rows.data.find((item) => item.slug === picked.selected.slug);
  if (!row) return null;
  return { group: toSearchGroup(row), selection: picked.selected };
}

export async function saveQueryPreference(pillar: ContentPillar, slug: string | null) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured. No group was changed, and no X request was made." };
  if (slug) {
    const row = await db.from("search_groups").select("slug, content_pillar, enabled").eq("slug", slug).maybeSingle();
    const stored = row.data?.content_pillar === "football" ? "manchester_united" : row.data?.content_pillar;
    if (row.error || !row.data || stored !== pillar || row.data.enabled === false) {
      return { ok: false as const, message: "That search group is not an enabled group for this pillar. Nothing was changed." };
    }
  }
  const current = await preferenceMap();
  const next = { ...current };
  if (slug) next[pillar] = slug;
  else delete next[pillar];
  const saved = await db.from("desk_schedule").update({ query_preference: next, updated_at: new Date().toISOString() }).eq("id", "default").select("id").maybeSingle();
  if (saved.error || !saved.data) return { ok: false as const, message: "The group choice could not be saved. No X request was made." };
  return { ok: true as const, message: slug ? "The next scan in this pillar will use that group. Nothing has been sent to X." : "The next scan will follow the evidence ranking again. Nothing has been sent to X." };
}
