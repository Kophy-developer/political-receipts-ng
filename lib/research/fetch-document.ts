import "server-only";
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

function htmlPassage(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 700);
}

function pdfPassage(bytes: Uint8Array) {
  const text = decode(bytes);
  const parts = [...text.matchAll(/\(([^\\)]{12,})\)/g)].map((match) => match[1]).join(" ");
  const clean = parts.replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 700);
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
      const passage = pdfPassage(bytes);
      return {
        ok: true as const,
        attempted: true as const,
        url: current.toString(),
        domain,
        title: current.pathname.split("/").pop() || domain,
        published: null,
        passage: passage || "The PDF was retrieved. No readable text was extracted, so no passage is stored.",
        kind: passage ? "pdf" : "pdf-empty",
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
        kind: "html",
      };
    }
    return { ok: false as const, attempted: true as const, message: "That file type is not stored. The desk keeps HTML and PDF excerpts." };
  }
  return { ok: false as const, attempted: true as const, message: "The page redirected too many times." };
}
