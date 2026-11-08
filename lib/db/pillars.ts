import "server-only";
import { contentPillarFromStorage, contentPillars, storagePillar, type ContentPillar, type StoragePillar } from "@/lib/pillars/catalog";
import { contentMix, type PillarSignal, type ScanAllowance } from "@/lib/pillars/scan";
import { serviceClient } from "@/lib/db/client";
import { usageSince } from "@/lib/db/usage";
import { scanBudget } from "@/lib/intel/budget";
import { lagosDayStart } from "@/lib/intel/limits";

export type DiscoveryContext = {
  publishedTotal: number;
  signals: PillarSignal[];
  mix: ReturnType<typeof contentMix>;
  allowance: ScanAllowance;
};

function hoursSince(iso: string | null, now: number) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, (now - then) / 3_600_000);
}

function openAllowance(): ScanAllowance {
  return { requestsRemaining: scanBudget.dailyXRequests, postsRemaining: scanBudget.dailyPosts, known: true };
}

function emptyContext(): DiscoveryContext {
  const signals = contentPillars.map((pillar) => ({
    pillar,
    share: 0,
    hoursSinceScan: null,
    hoursSincePost: null,
    queued: 0,
    readyDrafts: 0,
    configured: true,
    timeliness: "medium" as const,
  }));
  return { publishedTotal: 0, signals, mix: contentMix([]), allowance: openAllowance() };
}

export async function loadDiscoveryContext(now = Date.now()): Promise<DiscoveryContext> {
  const db = serviceClient();
  if (!db) return emptyContext();
  const published = await db
    .from("published_posts")
    .select("published_at, draft_id")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(20);
  if (published.error || !published.data) return emptyContext();
  const draftIds = published.data.map((row) => row.draft_id).filter((id): id is string => typeof id === "string");
  const drafts = draftIds.length
    ? await db.from("drafts").select("id, claim_id, content_pillar").in("id", draftIds)
    : { data: [] as Array<{ id?: string; claim_id?: string | null; content_pillar?: string | null }>, error: null };
  const fallbackDrafts = drafts.error ? (await db.from("drafts").select("id, claim_id").in("id", draftIds)).data ?? [] : [];
  const draftRows: Array<{ id?: string; claim_id?: string | null; content_pillar?: string | null }> = drafts.error ? fallbackDrafts : drafts.data ?? [];
  const claimIds = draftRows.map((row) => row.claim_id).filter((id): id is string => typeof id === "string");
  const claims = claimIds.length
    ? await db.from("claims").select("id, content_pillar").in("id", claimIds)
    : { data: [] as Array<{ id: string; content_pillar: string | null }> };
  const draftPillar = new Map(draftRows.flatMap((row) => (typeof row.id === "string" ? [[row.id, row] as const] : [])));
  const claimPillar = new Map((claims.data ?? []).map((row) => [row.id, row.content_pillar]));
  const posts = published.data.map((row) => {
    const draft = typeof row.draft_id === "string" ? draftPillar.get(row.draft_id) : undefined;
    const fromDraft = contentPillarFromStorage(draft?.content_pillar);
    const fromClaim = contentPillarFromStorage(draft?.claim_id ? claimPillar.get(draft.claim_id) : null);
    return {
      pillar: fromDraft ?? fromClaim,
      publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    };
  });
  const mix = contentMix(posts);
  const latestPost = new Map<ContentPillar, string>();
  for (const post of posts) {
    if (!post.pillar || !post.publishedAt || latestPost.has(post.pillar)) continue;
    latestPost.set(post.pillar, post.publishedAt);
  }
  const groups = await db.from("search_groups").select("content_pillar, last_used_at, enabled, query");
  const latestScan = new Map<ContentPillar, string>();
  const configured: Record<ContentPillar, boolean> = { politics: false, finance: false, manchester_united: false };
  const groupRows = groups.error
    ? ((await db.from("search_groups").select("last_used_at, enabled, query")).data ?? []).map((row) => ({
      content_pillar: "politics",
      last_used_at: row.last_used_at,
      enabled: row.enabled,
      query: row.query,
    }))
    : groups.data ?? [];
  for (const row of groupRows) {
    const pillar = contentPillarFromStorage(typeof row.content_pillar === "string" ? row.content_pillar : null);
    if (!pillar) continue;
    const query = typeof row.query === "string" ? row.query.trim() : "";
    if (row.enabled !== false && query.length > 0 && query.length <= 480) configured[pillar] = true;
    const used = typeof row.last_used_at === "string" ? row.last_used_at : null;
    if (!used) continue;
    const previous = latestScan.get(pillar);
    if (!previous || used > previous) latestScan.set(pillar, used);
  }
  const queue = await db.from("opportunities").select("content_pillar, lifecycle, status");
  const queued: Record<ContentPillar, number> = { politics: 0, finance: 0, manchester_united: 0 };
  const readyDrafts: Record<ContentPillar, number> = { politics: 0, finance: 0, manchester_united: 0 };
  if (!queue.error) {
    for (const row of queue.data ?? []) {
      const pillar = contentPillarFromStorage(typeof row.content_pillar === "string" ? row.content_pillar : null);
      const lifecycle = typeof row.lifecycle === "string" ? row.lifecycle : "";
      const open = lifecycle === "RANKED" || lifecycle === "ASSESSED" || (lifecycle === "" && row.status === "open");
      const drafted = lifecycle === "DRAFTING" || lifecycle === "READY_FOR_EDITOR" || lifecycle === "APPROVED";
      if (!pillar) continue;
      if (open) queued[pillar] += 1;
      if (drafted) readyDrafts[pillar] += 1;
    }
  }
  const usage = await usageSince(lagosDayStart());
  const allowance: ScanAllowance = usage.ok
    ? {
      requestsRemaining: Math.max(0, scanBudget.dailyXRequests - usage.totals.xRequests),
      postsRemaining: Math.max(0, scanBudget.dailyPosts - usage.totals.posts),
      known: true,
    }
    : { requestsRemaining: 0, postsRemaining: 0, known: false };
  const shareOf = new Map(mix.items.map((item) => [item.pillar, item.share]));
  const signals: PillarSignal[] = contentPillars.map((pillar) => ({
    pillar,
    share: shareOf.get(pillar) ?? 0,
    hoursSinceScan: hoursSince(latestScan.get(pillar) ?? null, now),
    hoursSincePost: hoursSince(latestPost.get(pillar) ?? null, now),
    queued: queued[pillar],
    readyDrafts: readyDrafts[pillar],
    configured: configured[pillar],
    timeliness: "medium",
  }));
  return { publishedTotal: mix.counted, signals, mix, allowance };
}

export function withoutStoredPillar<T extends { content_pillar?: string }>(row: T) {
  const copy = { ...row };
  delete copy.content_pillar;
  return copy;
}

export async function storedPillarForClaim(claimId: string): Promise<StoragePillar | null> {
  const db = serviceClient();
  if (!db) return null;
  const claim = await db.from("claims").select("content_pillar").eq("id", claimId).maybeSingle();
  const pillar = contentPillarFromStorage(typeof claim.data?.content_pillar === "string" ? claim.data.content_pillar : null);
  return pillar ? storagePillar(pillar) : null;
}

export async function storedPillarForPublished(rowId: string): Promise<StoragePillar | null> {
  const db = serviceClient();
  if (!db) return null;
  const post = await db.from("published_posts").select("draft_id").eq("id", rowId).maybeSingle();
  const draftId = typeof post.data?.draft_id === "string" ? post.data.draft_id : null;
  if (!draftId) return null;
  const draft = await db.from("drafts").select("claim_id, content_pillar").eq("id", draftId).maybeSingle();
  const direct = contentPillarFromStorage(typeof draft.data?.content_pillar === "string" ? draft.data.content_pillar : null);
  if (direct) return storagePillar(direct);
  const claimId = typeof draft.data?.claim_id === "string" ? draft.data.claim_id : null;
  return claimId ? storedPillarForClaim(claimId) : null;
}
