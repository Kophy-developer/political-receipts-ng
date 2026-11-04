import { inflateSync } from "node:zlib";
import { prepareStoredPassage, readableProse, sanitizeStoredText } from "@/lib/research/passage";

const needles = ["453", "polling unit", "artificial intelligence", "photograph", "biometric", "voter register", "registration centre", "registration center", "fake voter"];

type PdfObject = { id: number; dict: string; stream: string | null };

function latin1(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1");
}

function objectsFrom(source: string): PdfObject[] {
  const items: PdfObject[] = [];
  const marker = /(\d+)\s+\d+\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source))) {
    const start = match.index + match[0].length;
    const end = source.indexOf("endobj", start);
    if (end < 0) break;
    const body = source.slice(start, end);
    const streamAt = body.search(/\bstream\b/);
    let dict = body;
    let stream: string | null = null;
    if (streamAt >= 0) {
      dict = body.slice(0, streamAt);
      let dataStart = streamAt + "stream".length;
      if (body[dataStart] === "\r") dataStart += 1;
      if (body[dataStart] === "\n") dataStart += 1;
      const dataEnd = body.indexOf("endstream", dataStart);
      if (dataEnd > dataStart) stream = body.slice(dataStart, dataEnd).replace(/\r?\n$/, "");
    }
    items.push({ id: Number(match[1]), dict, stream });
    marker.lastIndex = end + "endobj".length;
  }
  return items;
}

function decodeStream(dict: string, stream: string | null) {
  if (!stream) return "";
  if (/\/FlateDecode\b/.test(dict)) {
    try {
      return inflateSync(Buffer.from(stream, "latin1")).toString("latin1");
    } catch {
      return "";
    }
  }
  if (/\/Filter\b/.test(dict)) return "";
  return stream;
}

function unescapePdfString(raw: string) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      if (ch !== "\u0000") out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (!next) break;
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += " ";
    else if (next === "t") out += " ";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next >= "0" && next <= "7") {
      let oct = next;
      for (let k = 0; k < 2 && raw[i + 1] >= "0" && raw[i + 1] <= "7"; k += 1) oct += raw[++i];
      const code = Number.parseInt(oct, 8);
      if (code > 0) out += String.fromCharCode(code);
    } else out += next;
  }
  return out;
}

function keepString(value: string) {
  const clean = sanitizeStoredText(value, 500);
  const letters = clean.match(/[A-Za-z]/g)?.length ?? 0;
  return letters >= 3 && letters / Math.max(clean.length, 1) >= 0.3 ? clean : "";
}

function stringsIn(content: string) {
  const found: string[] = [];
  const take = (raw: string) => {
    const kept = keepString(unescapePdfString(raw));
    if (kept) found.push(kept);
  };
  const literal = /\(((?:\\.|[^\\)])*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(content))) take(match[1]);
  const hex = /<([0-9A-Fa-f\s]{8,})>/g;
  while ((match = hex.exec(content))) {
    const digits = match[1].replace(/\s+/g, "");
    if (digits.length < 8 || digits.length % 2 !== 0) continue;
    let raw = "";
    for (let i = 0; i < digits.length; i += 2) raw += String.fromCharCode(Number.parseInt(digits.slice(i, i + 2), 16));
    take(raw);
  }
  return found;
}

function contentIds(dict: string) {
  const contents = dict.match(/\/Contents\s*(\[[\s\S]*?\]|\d+\s+\d+\s+R)/);
  if (!contents) return [];
  return [...contents[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((item) => Number(item[1]));
}

function isPage(dict: string) {
  return /\/Type\s*\/Page(?!s)\b/.test(dict);
}

export function extractPdfDocument(bytes: Uint8Array) {
  const source = latin1(bytes);
  const objects = objectsFrom(source);
  const byId = new Map(objects.map((item) => [item.id, item]));
  const pages = objects.filter((item) => isPage(item.dict));
  const pageTexts = (pages.length ? pages : objects.filter((item) => item.stream)).map((page, index) => {
    const ids = contentIds(page.dict);
    const streams = (ids.length ? ids : [page.id]).map((id) => byId.get(id)).filter((item): item is PdfObject => Boolean(item));
    const text = streams
      .flatMap((item) => stringsIn(decodeStream(item.dict, item.stream)))
      .join(" ");
    return { number: index + 1, text: sanitizeStoredText(text, 8000) };
  }).filter((page) => readableProse(page.text) || /[A-Za-z]{4,}/.test(page.text));

  if (!pageTexts.length) return { passage: "", pageLabel: null as string | null };
  const corpus = pageTexts.map((page) => page.text).join("\n");
  const lower = corpus.toLowerCase();
  let at = -1;
  let needle = "";
  for (const item of needles) {
    const found = lower.indexOf(item);
    if (found >= 0 && (at < 0 || found < at)) {
      at = found;
      needle = item;
    }
  }
  const window = at < 0 ? corpus.slice(0, 900) : corpus.slice(Math.max(0, at - 180), at + 720);
  const matching = needle ? pageTexts.filter((page) => page.text.toLowerCase().includes(needle)) : [];
  const pageLabel = matching.length > 1
    ? `pp. ${matching[0].number}–${matching[matching.length - 1].number}`
    : `p. ${(matching[0] ?? pageTexts[0]).number}`;
  const stored = prepareStoredPassage({ text: window, pageLabel });
  return { passage: stored.excerpt === "The PDF was retrieved. No readable text was extracted, so no passage is stored." ? "" : stored.excerpt, pageLabel: stored.pageLabel };
}
