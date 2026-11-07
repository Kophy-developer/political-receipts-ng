import "server-only";
import { readRetrievedBytes, rejectionForSize } from "@/lib/research/read-document";
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

export async function fetchDocument(raw: string) {
  const checked = await assertPublicUrl(raw);
  if (!checked.ok) return { ...checked, attempted: false as const };
  let current = checked.url;
  for (let hop = 0; hop < 3; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { accept: "text/html,application/pdf,text/plain,text/csv" },
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
    const sized = rejectionForSize(length);
    if (sized) return { ok: false as const, attempted: true as const, message: sized };
    const bytes = new Uint8Array(await response.arrayBuffer());
    const type = (response.headers.get("content-type") || "").toLowerCase();
    const read = readRetrievedBytes({ url: current.toString(), bytes, contentType: type });
    if (!read.ok) return { ok: false as const, attempted: true as const, message: read.message };
    const html = type.includes("html") ? decode(bytes) : "";
    return {
      ok: true as const,
      attempted: true as const,
      url: read.url,
      domain: read.domain,
      title: html ? htmlTitle(html) || read.domain : read.title,
      published: html ? publishedFrom(html) : null,
      passage: read.passage,
      pageLabel: read.pageLabel,
      kind: read.kind,
    };
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
