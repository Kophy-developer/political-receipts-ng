import { createHash } from "node:crypto";
import type { Observation } from "@/lib/research/extract";
import { interpretOfficialResponse, sourceRegistry, type StructuredDataset } from "@/lib/research/official-series";
import recordedFdiBody from "../../scripts/fixtures/world-bank-ng-fdi.json";

export const recordedWorldBankFdi: unknown = recordedFdiBody;

export const recordedFdiVersion = "c84cda8fe090bf46aba4a80736d2fcfdbd43ad057aade39b6a59e9f7b697571a";
export const recordedFdiUpdated = "2026-10-08";
export const recordedFdiIndicator = "BX.KLT.DINV.CD.WD";
export const recordedFdiCountry = "NG";
export const recordedFdiSourceId = "2";
export const cacheFreshDays = 120;

export type SeriesOrigin = "live" | "cached" | "csv" | "recorded";

export type SeriesProvenance = {
  origin: SeriesOrigin;
  live: boolean;
  label: string;
  indicator: string;
  country: string;
  unit: string;
  sourceUpdated: string | null;
  retrievedAt: string | null;
  dataVersion: string;
  completeness: "published-years" | "internal-gap";
  stale: boolean;
  years: number[];
  pageUrl: string;
  attemptSummary: string | null;
};

export type StructuredRecord = SeriesProvenance & {
  datasetId: string;
  basis: "nominal" | "real" | "unknown";
  sourceName: string;
  requestUrl: string;
  observations: Observation[];
  originalResponse: unknown;
  passage: string;
};

export type RetrievalAttempt = {
  url: string;
  format: "json" | "csv";
  status: number | null;
  contentType: string | null;
  timedOut: boolean;
  json: boolean;
  error: string | null;
};

const freshMs = cacheFreshDays * 24 * 60 * 60 * 1000;

export function versionOf(indicator: string, country: string, observations: Array<{ year: number; value: number }>) {
  const lines = observations
    .slice()
    .sort((left, right) => left.year - right.year)
    .map((item) => `${indicator}|${country}|${item.year}|${item.value}`)
    .join("\n");
  return createHash("sha256").update(lines).digest("hex");
}

export function cacheIsStale(retrievedAt: string | null, now: string) {
  if (!retrievedAt) return false;
  const retrieved = Date.parse(retrievedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(retrieved) || !Number.isFinite(current)) return false;
  return current - retrieved > freshMs;
}

function countryMatches(dataset: StructuredDataset, countryId: string) {
  if (!dataset.country) return false;
  if (countryId === dataset.country) return true;
  return dataset.country === "NG" && countryId === "NGA";
}

function labelFor(input: { origin: SeriesOrigin; sourceUpdated: string | null; retrievedAt: string | null; stale: boolean; years: number[]; failure?: string | null }) {
  const updated = input.sourceUpdated ? `Source last updated ${input.sourceUpdated}.` : "The source update date was not in the file.";
  const years = input.years.length ? `Years available: ${input.years[0]}–${input.years[input.years.length - 1]}.` : "No annual observation was available.";
  const retrieved = input.retrievedAt ? `Last retrieved ${input.retrievedAt}.` : "No retrieval timestamp was stored with this copy.";
  const age = input.stale ? ` The saved copy is older than ${cacheFreshDays} days.` : "";
  const failure = input.failure ? `${input.failure} ` : "";
  if (input.origin === "live") return `Live World Bank retrieval. ${updated} Retrieved ${input.retrievedAt || "at an unstated time"}. ${years}`;
  if (input.origin === "csv") return `${failure}World Bank CSV download. Not a live JSON retrieval. ${updated} ${retrieved}${age} ${years}`;
  if (input.origin === "recorded") return `${failure}Cached official data from the recorded World Bank response. Not a live retrieval. ${updated} ${retrieved}${age} ${years}`;
  return `${failure}Cached official data. Not a live retrieval. ${updated} ${retrieved}${age} ${years}`;
}

function completenessOf(years: number[], unpublished: number[], yearTo: number): "published-years" | "internal-gap" {
  const inside = unpublished.filter((year) => year !== yearTo);
  if (inside.length) return "internal-gap";
  if (years.length < 2) return "internal-gap";
  for (let year = years[0]; year <= years[years.length - 1]; year += 1) {
    if (!years.includes(year)) return "internal-gap";
  }
  return "published-years";
}

export function provenanceLabel(record: Pick<StructuredRecord, "origin" | "sourceUpdated" | "retrievedAt" | "stale" | "years" | "label">) {
  return record.label;
}

export function verifyOfficialBody(body: unknown, dataset: StructuredDataset, input: { now: string; origin: SeriesOrigin; retrievedAt: string | null; failure?: string | null; pin?: string | null; requestUrl?: string | null }): { ok: true; record: StructuredRecord } | { ok: false; reason: string } {
  const read = interpretOfficialResponse(body, dataset);
  if (!read.ok) return { ok: false, reason: read.message };
  const meta = Array.isArray(body) && body[0] && typeof body[0] === "object" ? body[0] as { sourceid?: unknown; lastupdated?: unknown } : {};
  if (typeof meta.lastupdated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(meta.lastupdated)) {
    return { ok: false, reason: "The official response has no source update date. It was not cached." };
  }
  if (!Array.isArray(body) || !Array.isArray(body[1])) return { ok: false, reason: "The official response is not the World Bank series envelope." };
  for (const item of body[1]) {
    if (!item || typeof item !== "object") continue;
    const row = item as { indicator?: { id?: unknown }; country?: { id?: unknown }; value?: unknown; date?: unknown };
    const year = Number(row.date);
    if (!Number.isInteger(year) || year < dataset.yearFrom || year > dataset.yearTo) continue;
    if (row.value === null || row.value === undefined || row.value === "") continue;
    if (row.indicator?.id !== dataset.indicator) return { ok: false, reason: "The response indicator does not match the requested series." };
    if (typeof row.country?.id !== "string" || !countryMatches(dataset, row.country.id)) return { ok: false, reason: "The response country does not match the requested series." };
  }
  if (input.pin && meta.sourceid !== undefined && String(meta.sourceid) !== recordedFdiSourceId) {
    return { ok: false, reason: "The recorded file is not World Development Indicators source 2." };
  }
  const version = versionOf(dataset.indicator || "", dataset.country || "", read.observations);
  if (input.pin && version !== input.pin) return { ok: false, reason: "The recorded observations do not match the verified World Bank FDI series." };
  if (input.pin && meta.lastupdated !== recordedFdiUpdated) return { ok: false, reason: "The recorded source update date does not match the verified file." };
  const years = read.observations.map((item) => item.year);
  const stale = cacheIsStale(input.retrievedAt, input.now);
  const completeness = completenessOf(years, read.unpublished, dataset.yearTo);
  const label = labelFor({ origin: input.origin, sourceUpdated: read.updated, retrievedAt: input.retrievedAt, stale, years, failure: input.failure });
  const passage = `${read.passage}\nProvenance: ${label}`;
  const record: StructuredRecord = {
    datasetId: dataset.id,
    origin: input.origin,
    live: input.origin === "live",
    label,
    indicator: dataset.indicator || "",
    country: dataset.country || "",
    unit: dataset.unit,
    basis: dataset.basis,
    sourceName: dataset.sourceName,
    pageUrl: dataset.pageUrl,
    requestUrl: input.requestUrl || dataset.apiUrl || dataset.pageUrl,
    sourceUpdated: read.updated,
    retrievedAt: input.retrievedAt,
    dataVersion: version,
    completeness,
    stale,
    years,
    attemptSummary: input.failure || null,
    observations: read.observations,
    originalResponse: body,
    passage,
  };
  return { ok: true, record };
}

export function recordedFdiVerified(now = "2026-11-07T13:05:29.000Z") {
  return verifyOfficialBody(recordedFdiBody, fdiDataset(), { now, origin: "recorded", retrievedAt: null, pin: recordedFdiVersion, requestUrl: fdiDataset().apiUrl });
}

function fdiDataset(): StructuredDataset {
  const dataset = sourceRegistry.find((item) => item.id === "world-bank-ng-fdi-net-inflows");
  if (!dataset) throw new Error("The World Bank FDI dataset is not registered.");
  return dataset;
}

export function recordedResumeWhy() {
  const verified = recordedFdiVerified();
  if (!verified.ok) return "No verified World Bank copy is available. Nothing was retrieved.";
  return `The live World Bank request failed before a status or a series was stored. ${verified.record.label} 2026 is not in that file and was not filled in. Resume uses this saved copy and does not call the API.`;
}

export function parseCsvTable(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"") {
        if (source[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

export function csvToWorldBankBody(csv: string, dataset: StructuredDataset): unknown | null {
  const table = parseCsvTable(csv);
  let updated: string | null = null;
  let sourceid: string | undefined;
  for (const cells of table) {
    const name = cells[0]?.trim().toLowerCase();
    if (name === "last updated date" && /^\d{4}-\d{2}-\d{2}$/.test(cells[1]?.trim() || "")) updated = cells[1].trim();
    if (name === "data source" && /world development indicators|world bank/i.test(cells.slice(1).join(" ") || cells[0] || "")) sourceid = recordedFdiSourceId;
  }
  const headerIndex = table.findIndex((cells) => cells.some((cell) => cell.trim().toLowerCase() === "indicator code"));
  if (headerIndex < 0) return null;
  const header = table[headerIndex].map((cell) => cell.trim());
  const indicatorIndex = header.findIndex((cell) => cell.toLowerCase() === "indicator code");
  const countryIndex = header.findIndex((cell) => cell.toLowerCase() === "country code");
  const yearColumns = header.flatMap((cell, index) => /^\d{4}$/.test(cell) ? [{ index, year: Number(cell) }] : []);
  const longYear = header.findIndex((cell) => cell.toLowerCase() === "year");
  const longValue = header.findIndex((cell) => cell.toLowerCase() === "value");
  const rows = [];
  for (const cells of table.slice(headerIndex + 1)) {
    const indicator = cells[indicatorIndex]?.trim();
    const country = cells[countryIndex]?.trim();
    if (!indicator || indicator !== dataset.indicator) continue;
    if (!country || !countryMatches(dataset, country)) continue;
    if (longYear >= 0 && longValue >= 0) {
      const year = cells[longYear]?.trim();
      const raw = cells[longValue]?.trim();
      rows.push({ date: year, value: raw ? Number(raw) : null, indicator: { id: indicator }, country: { id: dataset.country } });
      continue;
    }
    for (const column of yearColumns) {
      const raw = cells[column.index]?.trim();
      if (!raw) continue;
      const value = Number(raw);
      rows.push({ date: String(column.year), value: Number.isFinite(value) ? value : null, indicator: { id: indicator }, country: { id: dataset.country } });
    }
  }
  if (!rows.length) return null;
  return [{ lastupdated: updated, sourceid }, rows];
}

function savedRecord(dataset: StructuredDataset, input: { now: string; cache?: StructuredRecord | null; recordedBody?: unknown; failure?: string | null }) {
  if (input.cache) {
    const checked = verifyOfficialBody(input.cache.originalResponse, dataset, {
      now: input.now,
      origin: input.cache.origin === "live" ? "cached" : input.cache.origin,
      retrievedAt: input.cache.retrievedAt,
      failure: input.failure,
      requestUrl: input.cache.requestUrl,
    });
    if (checked.ok && checked.record.dataVersion === input.cache.dataVersion && checked.record.indicator === input.cache.indicator) {
      return checked;
    }
  }
  if (dataset.id === "world-bank-ng-fdi-net-inflows" && input.recordedBody) {
    return verifyOfficialBody(input.recordedBody, dataset, {
      now: input.now,
      origin: "recorded",
      retrievedAt: null,
      failure: input.failure,
      pin: recordedFdiVersion,
      requestUrl: dataset.apiUrl,
    });
  }
  return { ok: false as const, reason: "No validated saved World Bank series is available. Nothing was invented." };
}

export async function resolveOfficialSeries(dataset: StructuredDataset, input: {
  mode: "live" | "saved";
  now: string;
  load?: () => Promise<unknown>;
  cache?: StructuredRecord | null;
  recordedBody?: unknown;
}): Promise<{ ok: true; record: StructuredRecord; fetched: boolean; live: boolean } | { ok: false; message: string; fetched: boolean; live: false }> {
  if (input.mode === "saved") {
    const saved = savedRecord(dataset, input);
    if (!saved.ok) return { ok: false, message: saved.reason, fetched: false, live: false };
    return { ok: true, record: saved.record, fetched: false, live: false };
  }
  let failure = "Download failed. The World Bank API did not answer.";
  let body: unknown;
  try {
    body = input.load ? await input.load() : null;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    failure = timedOut
      ? "Download failed. The World Bank API did not answer (timeout)."
      : "Download failed. The World Bank API did not answer (network).";
    body = null;
  }
  if (body && typeof body === "object" && !Array.isArray(body) && "message" in body && typeof (body as { message?: unknown }).message === "string") {
    failure = `Download failed. ${(body as { message: string }).message}`;
    const csv = (body as { csv?: unknown }).csv;
    body = typeof csv === "string" ? { csv } : null;
  }
  if (body && typeof body === "object" && !Array.isArray(body) && typeof (body as { csv?: unknown }).csv === "string") {
    const converted = csvToWorldBankBody((body as { csv: string }).csv, dataset);
    const csvRecord = converted ? verifyOfficialBody(converted, dataset, { now: input.now, origin: "csv", retrievedAt: input.now, failure, requestUrl: dataset.apiUrl?.replace("format=json", "format=csv") }) : null;
    if (csvRecord?.ok) return { ok: true, record: csvRecord.record, fetched: true, live: false };
    if (!csvRecord || !csvRecord.ok) failure = csvRecord?.reason || failure;
    body = null;
  }
  if (body) {
    const live = verifyOfficialBody(body, dataset, { now: input.now, origin: "live", retrievedAt: input.now, requestUrl: dataset.apiUrl });
    if (live.ok) return { ok: true, record: live.record, fetched: true, live: true };
    failure = live.reason;
  }
  const saved = savedRecord(dataset, { ...input, failure });
  if (!saved.ok) return { ok: false, message: failure, fetched: true, live: false };
  return { ok: true, record: saved.record, fetched: false, live: false };
}

export function readProvenance(value: unknown): SeriesProvenance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<SeriesProvenance>;
  if (row.origin !== "live" && row.origin !== "cached" && row.origin !== "csv" && row.origin !== "recorded") return null;
  if (typeof row.label !== "string" || typeof row.indicator !== "string" || !Array.isArray(row.years)) return null;
  const years = row.years.filter((year): year is number => typeof year === "number" && Number.isInteger(year));
  return {
    origin: row.origin,
    live: row.live === true && row.origin === "live",
    label: row.label,
    indicator: row.indicator,
    country: typeof row.country === "string" ? row.country : "",
    unit: typeof row.unit === "string" ? row.unit : "",
    sourceUpdated: typeof row.sourceUpdated === "string" ? row.sourceUpdated : null,
    retrievedAt: typeof row.retrievedAt === "string" ? row.retrievedAt : null,
    dataVersion: typeof row.dataVersion === "string" ? row.dataVersion : "",
    completeness: row.completeness === "internal-gap" ? "internal-gap" : "published-years",
    stale: row.stale === true,
    years,
    pageUrl: typeof row.pageUrl === "string" ? row.pageUrl : "",
    attemptSummary: typeof row.attemptSummary === "string" ? row.attemptSummary : null,
  };
}
