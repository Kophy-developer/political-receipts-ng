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
  const unit = unitOf(text);
  const basis = basisOf(text);
  const sourceName = sourceNameOf(text);
  const series = seriesNameOf(text, "Unnamed series");
  const found: Observation[] = [];
  const push = (yearText: string, raw: string) => {
    const value = parseNumber(raw);
    if (value === null) return;
    if (found.some((item) => item.year === Number(yearText) && item.value === value)) return;
    found.push({ series, year: Number(yearText), value, unit, basis, sourceName, url });
  };
  for (const line of text.split(/\n+/)) {
    const match = line.trim().match(/^(19[9]\d|20[0-3]\d)\s*[|,:]\s*(-?\(?[\d,]+(?:\.\d+)?\)?)$/);
    if (match) push(match[1], match[2]);
  }
  if (!found.length) {
    const inline = /(?:^|[\s(])(19[9]\d|20[0-3]\d)\s*[|,:]\s*(-?\(?[\d,]+(?:\.\d+)?\)?)/g;
    let match: RegExpExecArray | null;
    while ((match = inline.exec(text))) push(match[1], match[2]);
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
  return {
    title,
    text,
    observations,
    readable,
    limitation: readable ? null : "The document was retrieved, but no readable text was extracted. Its contents were not invented.",
  };
}
