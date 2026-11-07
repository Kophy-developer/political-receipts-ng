import { tablePassage } from "@/lib/research/extract";
import { extractPdfDocument } from "@/lib/research/pdf-text";
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

export const documentByteLimit = 1_200_000;

export function rejectionForSize(length: number) {
  if (!Number.isFinite(length) || length <= documentByteLimit) return null;
  return "The file is too large to store an excerpt from.";
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
  kind: "pdf" | "pdf-empty" | "csv" | "html";
} | {
  ok: false;
  message: string;
};

export function readRetrievedBytes(input: { url: string; bytes: Uint8Array; contentType: string }): ReadDocument {
  const tooBig = rejectionForSize(input.bytes.byteLength);
  if (tooBig) return { ok: false, message: tooBig };
  const type = input.contentType.toLowerCase();
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
    const extracted = extractPdfDocument(input.bytes);
    const stored = prepareStoredPassage({ text: extracted.passage, pageLabel: extracted.pageLabel });
    return { ok: true, url: input.url, domain, title: fileName || domain, passage: stored.excerpt, pageLabel: extracted.pageLabel, kind: extracted.passage ? "pdf" : "pdf-empty" };
  }
  if (type.includes("csv")) {
    const passage = prepareStoredPassage({ text: decode(input.bytes), empty: "The file was retrieved. No readable rows were extracted, so no series is stored." }).excerpt;
    if (!passage) return { ok: false, message: "The file had no readable rows." };
    return { ok: true, url: input.url, domain, title: fileName || domain, passage, pageLabel: null, kind: "csv" };
  }
  if (type.includes("html") || type.includes("text/plain") || type === "") {
    const passage = htmlPassage(decode(input.bytes));
    if (!passage) return { ok: false, message: "The page had no readable text." };
    return { ok: true, url: input.url, domain, title: fileName || domain, passage, pageLabel: null, kind: "html" };
  }
  return { ok: false, message: "That file type is not stored. The desk keeps HTML, CSV, and PDF excerpts." };
}

export async function attemptDocumentRead(url: string, load: (url: string) => Promise<{ contentType: string; bytes: Uint8Array } | { message: string }>) {
  let loaded: { contentType: string; bytes: Uint8Array } | { message: string };
  try {
    loaded = await load(url);
  } catch {
    return { attempted: true as const, ok: false as const, url, message: "The page did not answer." };
  }
  if ("message" in loaded) return { attempted: true as const, ok: false as const, url, message: loaded.message };
  const sized = rejectionForSize(loaded.bytes.byteLength);
  if (sized) return { attempted: true as const, ok: false as const, url, message: sized };
  const read = readRetrievedBytes({ url, bytes: loaded.bytes, contentType: loaded.contentType });
  if (!read.ok) return { attempted: true as const, ok: false as const, url, message: read.message };
  return { attempted: true as const, ok: true as const, url, passage: read.passage, kind: read.kind, title: read.title };
}
