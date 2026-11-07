import { evidenceFromPdfPages, tablePassage } from "@/lib/research/extract";
import { extractPdfDocument, readPdfPages } from "@/lib/research/pdf-text";
import { prepareStoredPassage } from "@/lib/research/passage";

const passageFocus = ["453", "polling unit", "artificial intelligence", "photograph", "biometric", "voter register", "registration centre", "registration center", "fake voter", "capital importation", "foreign direct investment"];

function focusedPassage(text: string) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const needle of passageFocus) {
    const found = lower.indexOf(needle);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  const window = at < 0 ? text.slice(0, 900) : text.slice(Math.max(0, at - 180), at + 720);
  return prepareStoredPassage({ text: window, empty: "The page was retrieved. No readable text was extracted, so no passage is stored." }).excerpt;
}

export function htmlPassage(html: string) {
  const table = tablePassage(html);
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  const focused = focusedPassage(stripped);
  if (!table) return focused;
  return prepareStoredPassage({ text: `${table}\n${focused}`, empty: "The page was retrieved. No readable text was extracted, so no passage is stored." }).excerpt;
}

export const htmlByteLimit = 1_200_000;
export const documentByteLimit = htmlByteLimit;
export const downloadByteLimit = 8_000_000;

export function isPdfResource(contentType: string, url = "") {
  const type = contentType.toLowerCase();
  if (type.includes("html") || type.includes("csv") || type.startsWith("text/")) return false;
  if (type.includes("pdf")) return true;
  return /\.pdf(?:$|\?)/i.test(url);
}

export function previousSizeGate(rejection?: string | null) {
  return /too large to store an excerpt/i.test(rejection || "");
}

export function rejectionForDownload(length: number, contentType: string, url = "") {
  if (!Number.isFinite(length) || length <= 0) return null;
  const limit = isPdfResource(contentType, url) ? downloadByteLimit : htmlByteLimit;
  if (length <= limit) return null;
  return "Download too large";
}

export function rejectionForSize(length: number) {
  return rejectionForDownload(length, "text/html");
}

function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export type ReadDocument = {
  ok: true;
  url: string;
  domain: string;
  title: string;
  passage: string;
  pageLabel: string | null;
  outcome: string;
  kind: "pdf" | "pdf-empty" | "csv" | "html";
} | {
  ok: false;
  message: string;
};

export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) return { ok: false as const, message: "Download failed. The response had no body." };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      if (!step.value?.byteLength) continue;
      total += step.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { ok: false as const, message: "Download too large" };
      }
      chunks.push(step.value);
    }
  } catch {
    return { ok: false as const, message: "Download failed. The page did not answer." };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true as const, bytes };
}

export function readRetrievedBytes(input: { url: string; bytes: Uint8Array; contentType: string }): ReadDocument {
  const tooBig = rejectionForDownload(input.bytes.byteLength, input.contentType, input.url);
  if (tooBig) return { ok: false, message: tooBig };
  const type = isPdfResource(input.contentType, input.url) ? "application/pdf" : input.contentType.toLowerCase();
  const domain = (() => {
    try {
      return new URL(input.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const fileName = (() => {
    try {
      return decodeURIComponent(new URL(input.url).pathname.split("/").pop() || domain);
    } catch {
      return domain;
    }
  })();
  if (type.includes("pdf")) {
    const read = readPdfPages(input.bytes);
    if (!read.ok && !read.pages.length) return { ok: false, message: read.message };
    const evidence = evidenceFromPdfPages({ pages: read.pages, url: input.url, truncated: read.truncated });
    if (evidence.outcome === "Relevant evidence extracted") {
      return { ok: true, url: input.url, domain, title: fileName || domain, passage: evidence.passage, pageLabel: evidence.pageLabel, outcome: evidence.outcome, kind: "pdf" };
    }
    if (evidence.outcome === "Extracted text too large to store") return { ok: false, message: evidence.message };
    if (input.bytes.byteLength <= htmlByteLimit) {
      const prose = extractPdfDocument(input.bytes);
      const stored = prepareStoredPassage({ text: prose.passage, pageLabel: prose.pageLabel });
      if (prose.passage) {
        return { ok: true, url: input.url, domain, title: fileName || domain, passage: stored.excerpt, pageLabel: prose.pageLabel, outcome: "No relevant table found", kind: "pdf" };
      }
    }
    return { ok: false, message: read.ok ? evidence.message : read.message };
  }
  if (type.includes("csv")) {
    const passage = prepareStoredPassage({ text: decode(input.bytes), empty: "The file was retrieved. No readable rows were extracted, so no series is stored." }).excerpt;
    if (!passage) return { ok: false, message: "The file had no readable rows." };
    return { ok: true, url: input.url, domain, title: fileName || domain, passage, pageLabel: null, outcome: "Relevant evidence extracted", kind: "csv" };
  }
  if (type.includes("html") || type.includes("text/plain") || type === "") {
    const passage = htmlPassage(decode(input.bytes));
    if (!passage) return { ok: false, message: "The page had no readable text." };
    return { ok: true, url: input.url, domain, title: fileName || domain, passage, pageLabel: null, outcome: "Relevant evidence extracted", kind: "html" };
  }
  return { ok: false, message: "That file type is not stored. The desk keeps HTML, CSV, and PDF excerpts." };
}

export async function attemptDocumentRead(url: string, load: (url: string) => Promise<{ contentType: string; bytes: Uint8Array } | { message: string }>) {
  let loaded: { contentType: string; bytes: Uint8Array } | { message: string };
  try {
    loaded = await load(url);
  } catch {
    return { attempted: true as const, ok: false as const, url, message: "Download failed. The page did not answer." };
  }
  if ("message" in loaded) return { attempted: true as const, ok: false as const, url, message: loaded.message };
  const sized = rejectionForDownload(loaded.bytes.byteLength, loaded.contentType, url);
  if (sized) return { attempted: true as const, ok: false as const, url, message: sized };
  const read = readRetrievedBytes({ url, bytes: loaded.bytes, contentType: loaded.contentType });
  if (!read.ok) return { attempted: true as const, ok: false as const, url, message: read.message };
  return { attempted: true as const, ok: true as const, url, passage: read.passage, kind: read.kind, title: read.title };
}
