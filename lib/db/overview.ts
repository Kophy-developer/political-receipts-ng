import "server-only";
import type { DeskMode, DeskPost, DeskSnapshot } from "@/lib/desk/types";
import { serviceClient } from "@/lib/db/client";
import { listClaims } from "@/lib/db/claims";
import { listConversations } from "@/lib/db/conversations";
import { classificationFor, claimStatusLabel } from "@/lib/db/labels";
import { editorialTagIn } from "@/lib/desk/tag";
import { lagosStamp } from "@/lib/format";
import { rollingMix } from "@/lib/db/research";

type PostRow = {
  id: string;
  x_post_url: string | null;
  published_at: string | null;
  publishing_account: string | null;
  publish_approvals: { approved_text: string } | { approved_text: string }[] | null;
  drafts:
    | {
        suggested_hashtag: string | null;
        style: string | null;
        origin: "demo" | "live";
        claims: { claim_text: string; status: string; topics: { name: string } | null } | { claim_text: string; status: string; topics: { name: string } | null }[] | null;
      }
    | {
        suggested_hashtag: string | null;
        style: string | null;
        origin: "demo" | "live";
        claims: { claim_text: string; status: string; topics: { name: string } | null } | { claim_text: string; status: string; topics: { name: string } | null }[] | null;
      }[]
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function modeFor(origins: Array<"demo" | "live">, reachable: boolean, configured: boolean): DeskMode {
  if (!configured) return "unconfigured";
  if (!reachable) return "unreachable";
  if (origins.length === 0) return "empty";
  const demo = origins.some((origin) => origin === "demo");
  const live = origins.some((origin) => origin === "live");
  if (demo && live) return "mixed";
  return demo ? "demo" : "live";
}

export async function loadSnapshot(): Promise<DeskSnapshot> {
  const configured = Boolean(serviceClient());
  const [claimsResult, conversationsResult] = await Promise.all([listClaims(), listConversations()]);
  const unreachable = claimsResult.ok === false && claimsResult.reason !== "unconfigured" || conversationsResult.ok === false && conversationsResult.reason !== "unconfigured";
  const claims = claimsResult.ok ? claimsResult.claims : [];
  const conversations = conversationsResult.ok ? conversationsResult.conversations : [];
  const db = serviceClient();
  let draftsReady = 0;
  let published = 0;
  const ready: DeskSnapshot["ready"] = [];
  let latest: DeskPost[] = [];
  const origins: Array<"demo" | "live"> = [...claims.map((claim) => claim.origin), ...conversations.map((item) => item.origin)];
  if (db && claimsResult.ok) {
    const readyRows = await db
      .from("drafts")
      .select("claim_id, origin, claims ( claim_text )")
      .in("status", ["ready", "edited"]);
    if (!readyRows.error) {
      const seen = new Set<string>();
      for (const row of readyRows.data ?? []) {
        origins.push(row.origin as "demo" | "live");
        if (seen.has(row.claim_id)) continue;
        seen.add(row.claim_id);
        const claim = one(row.claims as { claim_text: string } | { claim_text: string }[] | null);
        ready.push({ claimId: row.claim_id, claim: claim?.claim_text || "Untitled claim", origin: row.origin as "demo" | "live" });
      }
      draftsReady = seen.size;
    }
    const posts = await db
      .from("published_posts")
      .select(`
        id, x_post_url, published_at, publishing_account,
        publish_approvals ( approved_text ),
        drafts ( suggested_hashtag, style, origin, claims ( claim_text, status, topics ( name ) ) )
      `)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3);
    if (!posts.error) {
      published = posts.data?.length ?? 0;
      latest = ((posts.data ?? []) as unknown as PostRow[]).map((row) => {
        const approval = one(row.publish_approvals);
        const draft = one(row.drafts);
        const claim = one(draft?.claims ?? null);
        if (draft?.origin) origins.push(draft.origin);
        const status = claimStatusLabel(claim?.status || "new");
        return {
          id: row.id,
          text: approval?.approved_text || claim?.claim_text || "Published text unavailable",
          url: row.x_post_url,
          publishedAt: lagosStamp(row.published_at),
          account: row.publishing_account || "desk account",
          hashtag: editorialTagIn(approval?.approved_text || ""),
          topic: claim?.topics?.name || "Unsorted",
          style: draft?.style ?? null,
          classification: classificationFor(status),
          origin: draft?.origin || "live",
        };
      });
    }
    const publishedCount = await db.from("published_posts").select("id", { count: "exact", head: true }).eq("status", "published");
    if (!publishedCount.error) published = publishedCount.count ?? published;
  }
  return {
    mode: modeFor(origins, !unreachable && (claimsResult.ok || !configured), configured),
    counts: {
      claims: claims.length,
      conversations: conversations.length,
      draftsReady,
      published,
    },
    moving: conversations.slice(0, 4),
    queue: claims.slice(0, 5),
    ready: ready.slice(0, 5),
    latest,
    mix: await rollingMix(),
  };
}

export async function listPublished() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { data, error } = await db
    .from("published_posts")
    .select(`
      id, x_post_url, published_at, publishing_account,
      publish_approvals ( approved_text ),
      drafts ( suggested_hashtag, style, origin, claims ( claim_text, status, topics ( name ) ) )
    `)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) return { ok: false as const, reason: "unreachable" as const };
  const posts: DeskPost[] = ((data ?? []) as unknown as PostRow[]).map((row) => {
    const approval = one(row.publish_approvals);
    const draft = one(row.drafts);
    const claim = one(draft?.claims ?? null);
    const status = claimStatusLabel(claim?.status || "new");
    return {
      id: row.id,
      text: approval?.approved_text || "Published text unavailable",
      url: row.x_post_url,
      publishedAt: lagosStamp(row.published_at),
      account: row.publishing_account || "desk account",
      hashtag: editorialTagIn(approval?.approved_text || ""),
      topic: claim?.topics?.name || "Unsorted",
      style: draft?.style ?? null,
      classification: classificationFor(status),
      origin: draft?.origin || "live",
    };
  });
  return { ok: true as const, posts };
}
