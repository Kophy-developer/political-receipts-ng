import "server-only";
import { serviceClient } from "@/lib/db/client";
import { contentPillarFromStorage, pillarLabels } from "@/lib/pillars/catalog";

export type ScanHeadline = {
  id: string;
  startedAt: string | null;
  status: string;
  posts: number;
  conversations: number | null;
  pillar: string;
  query: string | null;
  error: string | null;
  extraction: string | null;
};

export async function latestScanHeadline(): Promise<ScanHeadline | null> {
  const db = serviceClient();
  if (!db) return null;
  const scan = await db
    .from("scan_runs")
    .select("id, started_at, status, posts_stored, conversations_created, error, detail")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (scan.error || !scan.data) return null;
  const row = scan.data;
  const detail = row.detail && typeof row.detail === "object" && !Array.isArray(row.detail) ? row.detail as Record<string, unknown> : {};
  const storedPillar = typeof detail.contentPillar === "string" ? detail.contentPillar : null;
  const named = contentPillarFromStorage(storedPillar);
  return {
    id: String(row.id),
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    status: typeof row.status === "string" ? row.status : "unknown",
    posts: typeof row.posts_stored === "number" ? row.posts_stored : 0,
    conversations: typeof row.conversations_created === "number" ? row.conversations_created : null,
    pillar: named ? pillarLabels[named] : "Not recorded",
    query: typeof detail.query === "string" ? detail.query : typeof detail.groupName === "string" ? detail.groupName : null,
    error: typeof row.error === "string" && row.error.trim() ? row.error : null,
    extraction: typeof detail.extractionDetail === "string" ? detail.extractionDetail : null,
  };
}
