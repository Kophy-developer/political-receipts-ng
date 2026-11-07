import "server-only";
import { serviceClient } from "@/lib/db/client";
import { verifyOfficialBody, type StructuredRecord } from "@/lib/research/structured-cache";
import { sourceRegistry, type StructuredDataset } from "@/lib/research/official-series";

function datasetFor(id: string) {
  return sourceRegistry.find((item) => item.id === id) ?? null;
}

export async function loadStructuredCache(datasetId: string, now: string): Promise<StructuredRecord | null> {
  const dataset = datasetFor(datasetId);
  const db = serviceClient();
  if (!dataset || !db) return null;
  const row = await db
    .from("structured_series_cache")
    .select("dataset_id, indicator, country, unit, basis, source_name, page_url, request_url, source_updated, retrieved_at, data_version, origin, original_response")
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row.error || !row.data) return null;
  const origin = row.data.origin === "live" || row.data.origin === "csv" || row.data.origin === "recorded" || row.data.origin === "cached" ? row.data.origin : "cached";
  const checked = verifyOfficialBody(row.data.original_response, dataset, {
    now,
    origin: origin === "live" ? "cached" : origin,
    retrievedAt: typeof row.data.retrieved_at === "string" ? row.data.retrieved_at : null,
    requestUrl: typeof row.data.request_url === "string" ? row.data.request_url : dataset.apiUrl,
  });
  if (!checked.ok || checked.record.dataVersion !== row.data.data_version) return null;
  return checked.record;
}

export async function saveStructuredCache(record: StructuredRecord) {
  const db = serviceClient();
  if (!db) return;
  await db.from("structured_series_cache").upsert({
    dataset_id: record.datasetId,
    indicator: record.indicator,
    country: record.country,
    unit: record.unit,
    basis: record.basis,
    source_name: record.sourceName,
    page_url: record.pageUrl,
    request_url: record.requestUrl,
    source_updated: record.sourceUpdated,
    retrieved_at: record.retrievedAt,
    data_version: record.dataVersion,
    completeness: record.completeness,
    origin: record.origin,
    stale: record.stale,
    label: record.label,
    years: record.years,
    observations: record.observations,
    original_response: record.originalResponse,
  }, { onConflict: "dataset_id,data_version" });
}

export function datasetById(id: string): StructuredDataset | null {
  return datasetFor(id);
}
