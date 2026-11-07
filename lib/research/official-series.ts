import type { Observation } from "@/lib/research/extract";

export type StructuredDataset = {
  id: string;
  status: "available" | "unavailable";
  series: string;
  measure: string;
  indicator: string | null;
  country: string | null;
  unit: string;
  basis: "nominal" | "real" | "unknown";
  sourceName: string;
  pageUrl: string;
  apiUrl: string | null;
  yearFrom: number;
  yearTo: number;
  reason: string;
};

const fdi: StructuredDataset = {
  id: "world-bank-ng-fdi-net-inflows",
  status: "available",
  series: "Foreign direct investment",
  measure: "fdi-net-inflows",
  indicator: "BX.KLT.DINV.CD.WD",
  country: "NG",
  unit: "current US dollars",
  basis: "nominal",
  sourceName: "World Bank",
  pageUrl: "https://data.worldbank.org/indicator/BX.KLT.DINV.CD.WD?locations=NG",
  apiUrl: "https://api.worldbank.org/v2/country/NG/indicator/BX.KLT.DINV.CD.WD?format=json&per_page=70&date=2016:2026",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "World Bank indicator BX.KLT.DINV.CD.WD is Nigeria's annual foreign direct investment, net inflows, in current US dollars.",
};

const gdp: StructuredDataset = {
  id: "world-bank-ng-gdp-growth",
  status: "available",
  series: "Gross domestic product",
  measure: "gdp-growth",
  indicator: "NY.GDP.MKTP.KD.ZG",
  country: "NG",
  unit: "percent",
  basis: "real",
  sourceName: "World Bank",
  pageUrl: "https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=NG",
  apiUrl: "https://api.worldbank.org/v2/country/NG/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=70&date=2016:2026",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "World Bank indicator NY.GDP.MKTP.KD.ZG is Nigeria's annual real GDP growth. It is not an investment flow.",
};

function unavailable(input: Omit<StructuredDataset, "status" | "apiUrl" | "indicator" | "country"> & { indicator?: string | null; country?: string | null }): StructuredDataset {
  return { ...input, status: "unavailable", apiUrl: null, indicator: input.indicator ?? null, country: input.country ?? null };
}

const capitalImportation = unavailable({
  id: "nbs-capital-importation",
  series: "Capital importation",
  measure: "capital-importation",
  unit: "USD million",
  basis: "nominal",
  sourceName: "National Bureau of Statistics",
  pageUrl: "https://www.nigerianstat.gov.ng/",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "No machine-readable NBS capital-importation table is registered. World Bank FDI net inflows are a different measure and are not used in its place.",
});

const portfolio = unavailable({
  id: "portfolio-investment",
  series: "Portfolio investment",
  measure: "portfolio-investment",
  unit: "unspecified",
  basis: "unknown",
  sourceName: "Not registered",
  pageUrl: "",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "No machine-readable portfolio-investment series is registered. FDI net inflows are not a substitute.",
});

const announcement = unavailable({
  id: "investment-announcements",
  series: "Investment announcements",
  measure: "investment-announcement",
  unit: "unspecified",
  basis: "unknown",
  sourceName: "Not registered",
  pageUrl: "",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "An announced commitment is not a recorded investment flow. No structured announcement series is registered.",
});

const companies = unavailable({
  id: "investing-companies",
  series: "Investing companies",
  measure: "investing-companies",
  unit: "count",
  basis: "unknown",
  sourceName: "Not registered",
  pageUrl: "",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "A count of investing companies is not registered. FDI net inflows do not count companies.",
});

const cbn = unavailable({
  id: "cbn-external-sector",
  series: "External sector",
  measure: "cbn-external-sector",
  unit: "unspecified",
  basis: "unknown",
  sourceName: "Central Bank of Nigeria",
  pageUrl: "https://www.cbn.gov.ng/",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "No machine-readable CBN annual table is registered for this question.",
});

const unctad = unavailable({
  id: "unctad-fdi",
  series: "Foreign direct investment",
  measure: "unctad-fdi",
  unit: "unspecified",
  basis: "unknown",
  sourceName: "UNCTAD",
  pageUrl: "https://unctad.org/topic/investment/world-investment-report",
  yearFrom: 2016,
  yearTo: 2026,
  reason: "UNCTAD does not publish a stable annual API for Nigeria on this desk. The World Bank series is the structured FDI source.",
});

export const sourceRegistry = [fdi, gdp, capitalImportation, portfolio, announcement, companies, cbn, unctad];

export function matchStructuredQuestion(text: string): StructuredDataset | null {
  const value = text.toLowerCase();
  const economic = /invest|importation|foreign direct|\bfdi\b|gdp|portfolio|unctad|capital flow|\bcbn\b|central bank/.test(value);
  if (!economic) return null;
  if (/capital importation/.test(value)) return capitalImportation;
  if (/portfolio investment/.test(value)) return portfolio;
  if (/(announced|announcement|pledge|commitment)/.test(value)) return announcement;
  if (/(how many|number of) companies/.test(value)) return companies;
  if (/cbn|central bank of nigeria/.test(value) && !/foreign direct|\bfdi\b|foreign compan/.test(value)) return cbn;
  if (/unctad/.test(value)) return unctad;
  if (/gdp growth|real gdp/.test(value)) return gdp;
  if (/foreign direct|\bfdi\b|foreign compan|invest/.test(value)) return fdi;
  return null;
}

export type OfficialSeries = {
  ok: true;
  dataset: StructuredDataset;
  observations: Observation[];
  passage: string;
  updated: string | null;
  unpublished: number[];
  message: string;
} | {
  ok: false;
  message: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function interpretOfficialResponse(body: unknown, dataset: StructuredDataset): OfficialSeries {
  if (!dataset.apiUrl || dataset.status !== "available") return { ok: false, message: dataset.reason };
  if (!body || typeof body !== "object") return { ok: false, message: "The World Bank API did not return the indicator series." };
  if (!Array.isArray(body) || body.length < 2 || !Array.isArray(body[1])) {
    return { ok: false, message: "The World Bank API did not return the indicator series." };
  }
  const meta = body[0] && typeof body[0] === "object" ? body[0] as { lastupdated?: unknown } : {};
  const updated = typeof meta.lastupdated === "string" ? meta.lastupdated : null;
  const observations: Observation[] = [];
  for (const item of body[1]) {
    if (!item || typeof item !== "object") continue;
    const row = item as { date?: unknown; value?: unknown; indicator?: { id?: unknown }; country?: { id?: unknown } };
    const year = Number(row.date);
    if (!Number.isInteger(year) || year < dataset.yearFrom || year > dataset.yearTo) continue;
    if (row.value === null) continue;
    if (!finite(row.value)) continue;
    if (dataset.indicator && row.indicator?.id && row.indicator.id !== dataset.indicator) continue;
    if (dataset.country && row.country?.id && row.country.id !== dataset.country) continue;
    observations.push({
      series: dataset.series,
      year,
      value: row.value,
      unit: dataset.unit,
      basis: dataset.basis,
      sourceName: dataset.sourceName,
      url: dataset.pageUrl,
    });
  }
  observations.sort((left, right) => left.year - right.year);
  if (!observations.length) return { ok: false, message: "The official series did not include a usable annual observation. No figure was added." };
  const present = new Set(observations.map((item) => item.year));
  const unpublished = [];
  for (let year = dataset.yearFrom; year <= dataset.yearTo; year += 1) {
    if (!present.has(year)) unpublished.push(year);
  }
  const lines = [
    `Source URL: ${dataset.pageUrl}`,
    `Indicator: ${dataset.indicator} | Country: ${dataset.country} | Updated: ${updated || "not stated"}`,
    `Series: ${dataset.series} | Unit: ${dataset.unit} | Basis: ${dataset.basis} | Source: ${dataset.sourceName}`,
    ...observations.map((item) => `${item.year} | ${item.value} | p. 1`),
  ];
  if (unpublished.includes(dataset.yearTo)) {
    lines.push(`${dataset.yearTo} is not in the published series. It was not filled in.`);
  }
  const inside = unpublished.filter((year) => year !== dataset.yearTo);
  if (inside.length) lines.push(`The published series has no value for ${inside.join(", ")}. Those years were not filled in.`);
  return {
    ok: true,
    dataset,
    observations,
    passage: lines.join("\n"),
    updated,
    unpublished,
    message: "Relevant evidence extracted.",
  };
}

export async function loadOfficialSeries(dataset: StructuredDataset, input: { load: () => Promise<unknown>; alreadyStored?: boolean; storedPassage?: string | null }): Promise<OfficialSeries & { fetched: boolean }> {
  if (dataset.status !== "available") return { ok: false, fetched: false, message: dataset.reason };
  if (input.alreadyStored && input.storedPassage) {
    const kept = interpretOfficialResponse(passageToBody(input.storedPassage, dataset), dataset);
    if (kept.ok) return { ...kept, fetched: false, passage: input.storedPassage };
  }
  let body: unknown;
  try {
    body = await input.load();
  } catch {
    return { ok: false, fetched: true, message: "Download failed. The World Bank API did not answer." };
  }
  if (body && typeof body === "object" && !Array.isArray(body) && "message" in body && typeof (body as { message?: unknown }).message === "string") {
    return { ok: false, fetched: true, message: `Download failed. ${(body as { message: string }).message}` };
  }
  const read = interpretOfficialResponse(body, dataset);
  return { ...read, fetched: true };
}

function passageToBody(passage: string, dataset: StructuredDataset) {
  const rows = passage.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(20\d\d)\s*\|\s*(-?\d+(?:\.\d+)?)\s*\|/);
    if (!match) return [];
    return [{ date: match[1], value: Number(match[2]), indicator: { id: dataset.indicator }, country: { id: dataset.country } }];
  });
  return [{ lastupdated: null }, rows];
}

export async function fetchWorldBank(apiUrl: string) {
  const response = await fetch(apiUrl, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return { message: `The World Bank API returned ${response.status}.` };
  return response.json();
}
