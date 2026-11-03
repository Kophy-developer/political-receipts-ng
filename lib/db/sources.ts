import "server-only";
import { lagosStamp } from "@/lib/format";
import type { FiledSource } from "@/lib/desk/types";
import { schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { sourceTier } from "@/lib/db/labels";

type SourceRow = {
  id: string;
  organization: string;
  title: string;
  url: string | null;
  published_on: string | null;
  published_label: string | null;
  category: string;
  reliability: string;
  retrieved_at: string | null;
  origin: "demo" | "live";
};

export async function listSources() {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const };
  const { data, error } = await db.from("sources").select("id, organization, title, url, published_on, published_label, category, reliability, retrieved_at, origin").order("organization");
  if (error) return { ok: false as const, reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const), message: scrubDbMessage(error.message) };
  const sources: FiledSource[] = ((data ?? []) as SourceRow[]).map((row) => ({
    id: row.id,
    organization: row.organization,
    title: row.title,
    url: row.url && row.url.startsWith("https://") ? row.url : null,
    published: row.published_label || row.published_on || "Date not recorded",
    category: row.category,
    tier: sourceTier(row.category),
    reliability: row.reliability,
    retrievedAt: lagosStamp(row.retrieved_at),
    origin: row.origin,
  }));
  return { ok: true as const, sources };
}
