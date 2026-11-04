import { hostInDomains, hostname, isSocialHost } from "@/lib/research/filter";

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function officialEntryUrl(domain: string) {
  const host = domain.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "");
  return host ? `https://${host}/` : "";
}

export function queryTerms(queries: string[]) {
  const stop = new Set(["director", "department", "official", "record", "about", "with", "from", "that", "this", "into"]);
  const terms = new Set<string>();
  for (const query of queries) {
    for (const word of query.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length > 3 && !stop.has(word)) terms.add(word);
    }
  }
  return [...terms].slice(0, 12);
}

/** Same-host links only. One page in, a handful of matching links out. Not a crawl. */
export function officialLinks(html: string, pageUrl: string, domains: string[], terms: string[], limit: number) {
  const scored: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) continue;
    let url: URL;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    url.hash = "";
    const host = hostname(url.toString());
    if (!host || isSocialHost(host) || !hostInDomains(host, domains)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const text = decode(match[2]?.replace(/<[^>]+>/g, " ") || "");
    const haystack = `${url.pathname} ${text}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term.toLowerCase()) ? 1 : 0), 0);
    if (score > 0) scored.push({ url: key, score });
  }
  return scored
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, Math.max(0, limit))
    .map((item) => item.url);
}
