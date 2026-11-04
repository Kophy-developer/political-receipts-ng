import "server-only";
import type { ResearchProviderId } from "@/lib/research/choose";

export type SearchHit = {
  url: string;
  title: string;
  description: string;
  published: string | null;
};

export type SearchResult =
  | { ok: true; hits: SearchHit[]; credits: number | null }
  | { ok: false; message: string; cause: "unconfigured" | "unavailable" | "rejected" };

export type ResearchKeys = {
  tavily: boolean;
  brave: boolean;
  tavilyCredential: string | null;
  braveCredential: string | null;
};

export function researchKeys(): ResearchKeys {
  const tavily = Boolean(process.env.TAVILY_API_KEY?.trim());
  const brave = Boolean(process.env.BRAVE_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim());
  return {
    tavily,
    brave,
    tavilyCredential: tavily ? null : "TAVILY_API_KEY",
    braveCredential: brave ? null : "BRAVE_API_KEY",
  };
}

function dated(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 40) : null;
}

function braveKey() {
  return process.env.BRAVE_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim() || "";
}

export async function searchWeb(provider: ResearchProviderId, query: string, count: number): Promise<SearchResult> {
  if (provider === "tavily") return searchTavily(query, count);
  return searchBrave(query, count);
}

async function searchTavily(query: string, count: number): Promise<SearchResult> {
  const key = process.env.TAVILY_API_KEY?.trim() || "";
  if (!key) return { ok: false, message: "TAVILY_API_KEY is not set. No search was sent.", cause: "unconfigured" };
  let response: Response;
  try {
    response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query: query.slice(0, 300),
        max_results: Math.min(5, Math.max(1, count)),
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, message: "Tavily did not answer.", cause: "unavailable" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: "Tavily returned an unreadable page.", cause: response.status >= 500 ? "unavailable" : "rejected" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: "Tavily refused the credential. No fallback was sent yet.", cause: "rejected" };
  }
  if (response.status === 429 || response.status >= 500) {
    return { ok: false, message: `Tavily returned ${response.status}.`, cause: "unavailable" };
  }
  if (!response.ok) return { ok: false, message: `Tavily returned ${response.status}.`, cause: "rejected" };
  const payload = body as { results?: Array<{ url?: string; title?: string; content?: string; published_date?: string }>; usage?: { credits?: number } };
  const hits = (payload.results ?? []).flatMap((hit) => {
    if (!hit.url || !hit.url.startsWith("https://")) return [];
    return [{ url: hit.url, title: (hit.title || hit.url).slice(0, 180), description: (hit.content || "").slice(0, 400), published: dated(hit.published_date) }];
  });
  const reported = typeof payload.usage?.credits === "number" ? payload.usage.credits : null;
  return { ok: true, hits, credits: reported };
}

async function searchBrave(query: string, count: number): Promise<SearchResult> {
  const key = braveKey();
  if (!key) return { ok: false, message: "BRAVE_API_KEY is not set. No search was sent.", cause: "unconfigured" };
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.slice(0, 300));
  url.searchParams.set("count", String(Math.min(5, Math.max(1, count))));
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, message: "Brave did not answer.", cause: "unavailable" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, message: "Brave refused the credential.", cause: "rejected" };
  if (response.status === 429 || response.status >= 500) return { ok: false, message: `Brave returned ${response.status}.`, cause: "unavailable" };
  if (!response.ok) return { ok: false, message: `Brave returned ${response.status}.`, cause: "rejected" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: "Brave returned an unreadable page.", cause: "rejected" };
  }
  const results = (body as { web?: { results?: Array<{ url?: string; title?: string; description?: string; page_age?: string }> } })?.web?.results ?? [];
  const hits = results.flatMap((hit) => {
    if (!hit.url || !hit.url.startsWith("https://")) return [];
    return [{ url: hit.url, title: (hit.title || hit.url).slice(0, 180), description: (hit.description || "").slice(0, 400), published: dated(hit.page_age) }];
  });
  return { ok: true, hits, credits: null };
}

export function searchProvider() {
  const keys = researchKeys();
  const preference = process.env.RESEARCH_PROVIDER?.trim().toLowerCase() === "brave" ? "brave" : "tavily";
  const configured = preference === "brave" ? keys.brave : keys.tavily || keys.brave;
  const credential = preference === "brave" ? keys.braveCredential : keys.tavily ? null : keys.brave ? null : "TAVILY_API_KEY";
  return {
    name: preference === "brave" ? "Brave Search" : "Tavily",
    configured,
    credential,
  };
}
