/** Provider request bodies. Domain limits are explicit parameters, not words inside the query. */

export function tavilySearchBody(query: string, count: number, domains: string[]) {
  const body: Record<string, unknown> = {
    query: query.slice(0, 300),
    max_results: Math.min(5, Math.max(1, count)),
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
  };
  const include = domains.map((domain) => domain.toLowerCase().replace(/^www\./, "")).filter(Boolean).slice(0, 8);
  if (include.length) body.include_domains = include;
  return body;
}

export function braveSearchQuery(query: string, domains: string[]) {
  const sites = domains.map((domain) => domain.toLowerCase().replace(/^www\./, "")).filter(Boolean).slice(0, 8);
  if (!sites.length) return query.slice(0, 300);
  return `${query} (${sites.map((domain) => `site:${domain}`).join(" OR ")})`.slice(0, 400);
}
