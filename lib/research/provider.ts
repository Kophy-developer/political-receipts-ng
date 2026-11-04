import "server-only";

export type SearchHit = {
  url: string;
  title: string;
  description: string;
  published: string | null;
};

export type SearchProvider = {
  name: string;
  configured: boolean;
  credential: string | null;
  search(query: string, count: number): Promise<{ ok: true; hits: SearchHit[] } | { ok: false; message: string }>;
};

export function searchProvider(): SearchProvider {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim() || "";
  return {
    name: "Brave Search",
    configured: Boolean(key),
    credential: key ? null : "BRAVE_SEARCH_API_KEY",
    async search(query, count) {
      if (!key) return { ok: false, message: "BRAVE_SEARCH_API_KEY is not set. No search was sent." };
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
        return { ok: false, message: "The search provider did not answer." };
      }
      if (!response.ok) return { ok: false, message: `The search provider returned ${response.status}.` };
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, message: "The search provider returned an unreadable page." };
      }
      const results = (body as { web?: { results?: Array<{ url?: string; title?: string; description?: string; page_age?: string }> } })?.web?.results ?? [];
      const hits = results.flatMap((hit) => {
        if (!hit.url || !hit.url.startsWith("https://")) return [];
        const dated = typeof hit.page_age === "string" && /^\d{4}-\d{2}-\d{2}/.test(hit.page_age) ? hit.page_age.slice(0, 40) : null;
        return [{ url: hit.url, title: (hit.title || hit.url).slice(0, 180), description: (hit.description || "").slice(0, 400), published: dated }];
      });
      return { ok: true, hits };
    },
  };
}
