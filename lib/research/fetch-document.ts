import "server-only";
import { extractPdfDocument } from "@/lib/research/pdf-text";
import { prepareStoredPassage } from "@/lib/research/passage";
import { assertPublicUrl } from "@/lib/research/ssrf";

const limitBytes = 1_200_000;

function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function htmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) : "";
}

function publishedFrom(html: string) {
  const match = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|citation_publication_date|date)["'][^>]+content=["']([^"']+)["']/i);
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 40 ? null : value;
}

const passageFocus = ["453", "polling unit", "artificial intelligence", "photograph", "biometric", "voter register", "registration centre", "registration center", "fake voter"];

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

function htmlPassage(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return focusedPassage(stripped);
}

export async function fetchDocument(raw: string) {
  const checked = await assertPublicUrl(raw);
  if (!checked.ok) return { ...checked, attempted: false as const };
  let current = checked.url;
  for (let hop = 0; hop < 3; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { accept: "text/html,application/pdf,text/plain" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return { ok: false as const, attempted: true as const, message: "The page did not answer." };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false as const, attempted: true as const, message: "The page redirected without a destination." };
      const next = await assertPublicUrl(new URL(location, current).toString());
      if (!next.ok) return { ...next, attempted: true as const };
      current = next.url;
      continue;
    }
    if (!response.ok) return { ok: false as const, attempted: true as const, message: `The page returned ${response.status}.` };
    const length = Number(response.headers.get("content-length") || "0");
    if (length > limitBytes) return { ok: false as const, attempted: true as const, message: "The file is too large to store an excerpt from." };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) return { ok: false as const, attempted: true as const, message: "The file is too large to store an excerpt from." };
    const type = (response.headers.get("content-type") || "").toLowerCase();
    const domain = current.hostname.replace(/^www\./, "");
    if (type.includes("pdf")) {
      const extracted = extractPdfDocument(bytes);
      const stored = prepareStoredPassage({ text: extracted.passage, pageLabel: extracted.pageLabel });
      return {
        ok: true as const,
        attempted: true as const,
        url: current.toString(),
        domain,
        title: current.pathname.split("/").pop() || domain,
        published: null,
        passage: stored.excerpt,
        pageLabel: stored.pageLabel,
        kind: extracted.passage ? "pdf" : "pdf-empty",
      };
    }
    if (type.includes("html") || type.includes("text/plain") || type === "") {
      const html = decode(bytes);
      const passage = htmlPassage(html);
      if (!passage) return { ok: false as const, attempted: true as const, message: "The page had no readable text." };
      return {
        ok: true as const,
        attempted: true as const,
        url: current.toString(),
        domain,
        title: htmlTitle(html) || domain,
        published: publishedFrom(html),
        passage,
        pageLabel: null,
        kind: "html",
      };
    }
    return { ok: false as const, attempted: true as const, message: "That file type is not stored. The desk keeps HTML and PDF excerpts." };
  }
  return { ok: false as const, attempted: true as const, message: "The page redirected too many times." };
}

export async function readOfficialHtml(raw: string) {
  const checked = await assertPublicUrl(raw);
  if (!checked.ok) return { ...checked, attempted: false as const };
  let current = checked.url;
  for (let hop = 0; hop < 2; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { accept: "text/html,text/plain" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return { ok: false as const, attempted: true as const, message: "The official page did not answer." };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false as const, attempted: true as const, message: "The official page redirected without a destination." };
      const next = await assertPublicUrl(new URL(location, current).toString());
      if (!next.ok) return { ...next, attempted: true as const };
      current = next.url;
      continue;
    }
    if (!response.ok) return { ok: false as const, attempted: true as const, message: `The official page returned ${response.status}.` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) return { ok: false as const, attempted: true as const, message: "The official page is too large to inspect." };
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("html") && !type.includes("text/plain") && type !== "") {
      return { ok: false as const, attempted: true as const, message: "The official entry is not an HTML page, so no links were followed." };
    }
    return { ok: true as const, attempted: true as const, url: current.toString(), html: decode(bytes) };
  }
  return { ok: false as const, attempted: true as const, message: "The official page redirected too many times." };
}
