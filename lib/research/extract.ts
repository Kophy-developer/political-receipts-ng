import { tableExcerptLimit } from "@/lib/research/passage";

export type ObservationBasis = "nominal" | "real" | "unknown";

export type Observation = {
  series: string;
  year: number;
  value: number;
  unit: string;
  basis: ObservationBasis;
  sourceName: string;
  url: string;
};

export type ExtractedDocument = {
  title: string;
  text: string;
  observations: Observation[];
  readable: boolean;
  limitation: string | null;
};

const yearPattern = /^(?:19[9]\d|20[0-3]\d)$/;

function clean(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function cellText(value: string) {
  return clean(value.replace(/<[^>]+>/g, " "));
}

function parseNumber(raw: string) {
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, "").replace(/^\((.+)\)$/, "-$1");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function basisOf(text: string): ObservationBasis {
  if (/\b(constant prices|real terms|\breal\b)/i.test(text)) return "real";
  if (/\b(current prices|nominal)\b/i.test(text)) return "nominal";
  return "unknown";
}

function unitOf(text: string) {
  if (/usd million|us\$ million|\$ million/i.test(text)) return "USD million";
  if (/usd billion|us\$ billion|\$ billion/i.test(text)) return "USD billion";
  if (/\bnaira\b|₦/i.test(text)) return "naira";
  if (/\bpercent\b|%/i.test(text)) return "percent";
  return "unspecified";
}

function sourceNameOf(text: string) {
  if (/national bureau of statistics|\bnbs\b/i.test(text)) return "National Bureau of Statistics";
  if (/central bank of nigeria|\bcbn\b/i.test(text)) return "Central Bank of Nigeria";
  if (/unctad/i.test(text)) return "UNCTAD";
  if (/world bank/i.test(text)) return "World Bank";
  return "Not named in the document";
}

function seriesNameOf(text: string, fallback: string) {
  const named = text.match(/\b(capital importation|foreign direct investment|portfolio investment|gross domestic product)\b/i);
  if (!named) return fallback;
  const labels: Record<string, string> = {
    "capital importation": "Capital importation",
    "foreign direct investment": "Foreign direct investment",
    "portfolio investment": "Portfolio investment",
    "gross domestic product": "Gross domestic product",
  };
  return labels[named[1].toLowerCase()] ?? named[1];
}

function rowsFromHtml(html: string) {
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  return tables.flatMap((table) => {
    const attrs = table[1] || "";
    const body = table[2] || "";
    const attr = (name: string) => attrs.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] ?? "";
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => (
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cellText(cell[1] || ""))
    ));
    return [{
      series: attr("data-series"),
      unit: attr("data-unit"),
      basis: attr("data-basis"),
      source: attr("data-source"),
      rows,
    }];
  });
}

function observationsFromRows(input: {
  rows: string[][];
  series: string;
  unit: string;
  basis: ObservationBasis;
  sourceName: string;
  url: string;
}) {
  if (input.rows.length < 2) return [] as Observation[];
  const header = input.rows[0].map((cell) => cell.toLowerCase());
  const yearIndex = header.findIndex((cell) => cell === "year" || cell.includes("year"));
  if (yearIndex < 0) return [];
  const valueIndexes = header.flatMap((cell, index) => (index !== yearIndex && cell && !/note|source/.test(cell) ? [index] : []));
  const found: Observation[] = [];
  for (const row of input.rows.slice(1)) {
    const yearText = row[yearIndex] ?? "";
    if (!yearPattern.test(yearText)) continue;
    const targets = valueIndexes.length ? valueIndexes : row.flatMap((_, index) => (index === yearIndex ? [] : [index]));
    for (const index of targets) {
      const value = parseNumber(row[index] ?? "");
      if (value === null) continue;
      const headerName = input.rows[0][index] || "";
      const series = input.series || seriesNameOf(headerName, "Unnamed series");
      found.push({
        series: headerName && !/value|usd|amount|naira|percent/.test(headerName.toLowerCase()) ? seriesNameOf(headerName, headerName) : series,
        year: Number(yearText),
        value,
        unit: input.unit,
        basis: input.basis,
        sourceName: input.sourceName,
        url: input.url,
      });
    }
  }
  return found;
}

function observationsFromLines(text: string, url: string) {
  const found: Observation[] = [];
  let series = seriesNameOf(text, "Unnamed series");
  let unit = unitOf(text);
  let basis = basisOf(text);
  let sourceName = sourceNameOf(text);
  let sawHeader = false;
  const header = /^Series:\s*(.+?)\s*\|\s*Unit:\s*(.+?)\s*\|\s*Basis:\s*(nominal|real|unknown)(?:\s*\|\s*Source:\s*(.+))?$/i;
  const row = /^(19[9]\d|20[0-3]\d)\s*[|,:]\s*(-?\(?[\d,]+(?:\.\d+)?\)?)(?:\s*\|\s*p\.\s*\d+)?$/;
  for (const line of text.split(/\n+/)) {
    const heading = line.trim().match(header);
    if (heading) {
      sawHeader = true;
      series = seriesNameOf(heading[1], heading[1].trim());
      unit = unitOf(heading[2]) === "unspecified" ? heading[2].trim() : unitOf(heading[2]);
      const namedBasis = heading[3].toLowerCase();
      basis = namedBasis === "real" || namedBasis === "nominal" ? namedBasis : "unknown";
      if (heading[4]) sourceName = sourceNameOf(heading[4]);
      continue;
    }
    const match = line.trim().match(row);
    if (!match) continue;
    const value = parseNumber(match[2]);
    if (value === null) continue;
    if (found.some((item) => item.series === series && item.year === Number(match[1]) && item.value === value && item.unit === unit)) continue;
    found.push({ series, year: Number(match[1]), value, unit, basis, sourceName, url });
  }
  if (!found.length && !sawHeader) {
    const inlineSeries = seriesNameOf(text, "Unnamed series");
    const inline = /(?:^|[\s(])(19[9]\d|20[0-3]\d)\s*[|,:]\s*(-?\(?[\d,]+(?:\.\d+)?\)?)/g;
    let match: RegExpExecArray | null;
    while ((match = inline.exec(text))) {
      const current = match;
      const value = parseNumber(current[2]);
      if (value === null) continue;
      if (found.some((item) => item.year === Number(current[1]) && item.value === value)) continue;
      found.push({ series: inlineSeries, year: Number(current[1]), value, unit: unitOf(text), basis: basisOf(text), sourceName: sourceNameOf(text), url });
    }
  }
  return found;
}

export function tablePassage(html: string) {
  const tables = rowsFromHtml(html);
  if (!tables.length) return "";
  const lines: string[] = [];
  for (const table of tables) {
    const head = table.rows[0]?.join(" | ") ?? "";
    if (head) lines.push(head);
    for (const row of table.rows.slice(1)) lines.push(row.join(" | "));
  }
  return lines.join("\n");
}

export function extractDocument(input: { html?: string; csv?: string; text?: string; url?: string; title?: string }): ExtractedDocument {
  const url = input.url || "";
  const html = input.html || "";
  const title = input.title || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
  const prose = clean(html.replace(/<[^>]+>/g, " "));
  const context = `${title}\n${prose}\n${input.text || ""}\n${input.csv || ""}`;
  const fromTables = rowsFromHtml(html).flatMap((table) => observationsFromRows({
    rows: table.rows,
    series: table.series || seriesNameOf(`${table.series} ${context}`, "Unnamed series"),
    unit: table.unit || unitOf(context),
    basis: table.basis === "real" || table.basis === "nominal" ? table.basis : basisOf(context),
    sourceName: table.source || sourceNameOf(context),
    url,
  }));
  const csvText = input.csv || "";
  const csvRows = csvText.trim()
    ? csvText.trim().split(/\n+/).map((line) => line.split(",").map((cell) => cell.trim()))
    : [];
  const fromCsv = csvRows.length ? observationsFromRows({
    rows: csvRows,
    series: seriesNameOf(csvText, seriesNameOf(context, "Unnamed series")),
    unit: unitOf(`${csvText}\n${context}`),
    basis: basisOf(`${csvText}\n${context}`),
    sourceName: sourceNameOf(`${csvText}\n${context}`),
    url,
  }) : [];
  const fromLines = fromTables.length || fromCsv.length ? [] : observationsFromLines(input.text || tablePassage(html), url);
  const observations = [...fromTables, ...fromCsv, ...fromLines].filter((item, index, all) => (
    all.findIndex((other) => other.series === item.series && other.year === item.year && other.value === item.value) === index
  ));
  const text = [title, prose, input.text || "", csvText, tablePassage(html)].filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const readable = /[A-Za-z]/.test(text);
  const incomplete = /Pages after \d+ were not read/.test(input.text || "");
  return {
    title,
    text,
    observations,
    readable,
    limitation: !readable
      ? "The document was retrieved, but no readable text was extracted. Its contents were not invented."
      : incomplete
        ? "Later pages were not read, so this table may be incomplete. No missing year was filled in."
        : null,
  };
}

type PdfEvidenceRow = {
  series: string;
  year: number;
  value: number;
  unit: string;
  basis: ObservationBasis;
  page: number;
  sourceName: string;
};

export function evidenceFromPdfPages(input: {
  pages: Array<{ number: number; lines: string[] }>;
  url: string;
  truncated: boolean;
  focus?: string[];
  excerptLimit?: number;
}) {
  const focus = (input.focus?.length ? input.focus : ["capital importation", "foreign direct investment", "portfolio investment"]).map((item) => item.toLowerCase());
  const sourceName = sourceNameOf(input.pages.flatMap((page) => page.lines).join("\n"));
  let series = "";
  let unit = "unspecified";
  let basis: ObservationBasis = "unknown";
  const rows: PdfEvidenceRow[] = [];
  const rowPattern = /(19[9]\d|20[0-3]\d)\s*[|,:]\s*(-?\(?[\d,]+(?:\.\d+)?\)?)/g;
  for (const page of input.pages) {
    for (const line of page.lines) {
      const named = seriesNameOf(line, "");
      const lineUnit = unitOf(line);
      const lineBasis = basisOf(line);
      if (named) series = named;
      if (lineUnit !== "unspecified") unit = lineUnit;
      if (lineBasis !== "unknown") basis = lineBasis;
      if (!series || !focus.some((item) => series.toLowerCase().includes(item))) continue;
      rowPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rowPattern.exec(line))) {
        const value = parseNumber(match[2]);
        if (value === null) continue;
        rows.push({ series, year: Number(match[1]), value, unit, basis, page: page.number, sourceName });
      }
    }
  }
  const unique = rows.filter((row, index) => rows.findIndex((other) => other.series === row.series && other.year === row.year && other.value === row.value && other.unit === row.unit && other.page === row.page) === index);
  if (!unique.length) {
    return {
      outcome: "No relevant table found" as const,
      message: "No relevant table found. Readable pages were checked and none contained a table for the requested series. No figures were added.",
      passage: "",
      pageLabel: null,
    };
  }
  const limit = input.excerptLimit ?? tableExcerptLimit;
  const groups: PdfEvidenceRow[][] = [];
  for (const row of unique) {
    const last = groups[groups.length - 1];
    if (last && last[0].series === row.series && last[0].unit === row.unit && last[0].basis === row.basis) last.push(row);
    else groups.push([row]);
  }
  const blocks = groups.map((group) => {
    const head = group[0];
    const lines = [
      `Series: ${head.series} | Unit: ${head.unit} | Basis: ${head.basis} | Source: ${head.sourceName}`,
      ...group.map((row) => `${row.year} | ${row.value} | p. ${row.page}`),
    ];
    return lines.join("\n");
  });
  const notice = input.truncated ? `Pages after ${input.pages[input.pages.length - 1]?.number ?? 0} were not read. No missing year was filled in.` : "";
  const passage = [`Source URL: ${input.url}`, ...blocks, notice].filter(Boolean).join("\n");
  if (passage.length > limit) {
    return {
      outcome: "Extracted text too large to store" as const,
      message: `Extracted text too large to store. The relevant table has ${unique.length} complete rows and was not cut, because a partial table would change the reading.`,
      passage: "",
      pageLabel: null,
    };
  }
  const pages = [...new Set(unique.map((row) => row.page))].sort((left, right) => left - right);
  const pageLabel = pages.length > 1 ? `pp. ${pages[0]}–${pages[pages.length - 1]}` : `p. ${pages[0]}`;
  return {
    outcome: "Relevant evidence extracted" as const,
    message: "Relevant evidence extracted.",
    passage,
    pageLabel,
  };
}
