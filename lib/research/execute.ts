import { classifyResult, hostname, hostInDomains } from "@/lib/research/filter";
import type { SearchResultDraft } from "@/lib/research/inventory";
import { tierForHost } from "@/lib/research/tiers";
import type { SearchStage, SourceCategory } from "@/lib/research/types";

export type StageHit = { url: string; title: string; description: string; published: string | null };

type SearchAnswer =
  | { ok: true; hits: StageHit[]; credits: number | null }
  | { ok: false; message: string; cause: "unconfigured" | "unavailable" | "rejected" };

export type SearchMetric = {
  query: string;
  domains: string[];
  ok: boolean;
  cause: "unconfigured" | "unavailable" | "rejected" | null;
  message: string | null;
  credits: number | null;
  resultsReturned: number;
  inDomain: number;
  outOfDomain: number;
  documentsSelected: number;
  primarySourcesFound: number;
  outside: Array<{ url: string; reason: string }>;
};

export async function executeStage(input: {
  stage: SearchStage;
  domains: string[];
  categories: SourceCategory[];
  searches: Array<{ query: string; question: string; problem: string; domains: string[] }>;
  search: (query: string, domains: string[]) => Promise<SearchAnswer>;
  onSearch?: (metric: SearchMetric) => Promise<void> | void;
  onInventory?: (rows: SearchResultDraft[]) => Promise<void> | void;
}) {
  const inventory: SearchResultDraft[] = [];
  const outside: Array<{ url: string; reason: string }> = [];
  const errors: string[] = [];
  let attempted = 0;
  let stop: "unavailable" | "rejected" | null = null;

  for (const [queryIndex, item] of input.searches.entries()) {
    if (stop) break;
    const domains = item.domains.length ? item.domains : input.domains;
    const result = await input.search(item.query, domains);
    attempted += 1;
    if (!result.ok) {
      const metric: SearchMetric = {
        query: item.query,
        domains,
        ok: false,
        cause: result.cause,
        message: result.message,
        credits: null,
        resultsReturned: 0,
        inDomain: 0,
        outOfDomain: 0,
        documentsSelected: 0,
        primarySourcesFound: 0,
        outside: [],
      };
      await input.onSearch?.(metric);
      errors.push(result.message);
      stop = result.cause === "unavailable" ? "unavailable" : "rejected";
      break;
    }
    const rows: SearchResultDraft[] = [];
    let inDomain = 0;
    let outOfDomain = 0;
    result.hits.forEach((hit, index) => {
      const host = hostname(hit.url) || "";
      const decision = classifyResult(hit.url, input.stage, domains);
      const inside = Boolean(host && domains.length && hostInDomains(host, domains));
      if (inside) inDomain += 1;
      else outOfDomain += 1;
      const tier = tierForHost(host, input.categories);
      const row: SearchResultDraft = {
        query: item.query,
        question: item.question,
        problem: item.problem,
        queryIndex,
        resultRank: index + 1,
        title: hit.title || hit.url,
        url: hit.url,
        domain: host,
        snippet: hit.description || "",
        published: hit.published,
        targetTier: tier.name,
        tierRank: tier.rank,
        inDomain: inside,
        retrievalStatus: decision.keep ? "not_retrieved" : "rejected",
        rejectionReason: decision.keep ? null : decision.reason,
      };
      rows.push(row);
      if (!decision.keep && decision.reason) outside.push({ url: hit.url, reason: decision.reason });
    });
    inventory.push(...rows);
    await input.onSearch?.({
      query: item.query,
      domains,
      ok: true,
      cause: null,
      message: null,
      credits: result.credits,
      resultsReturned: result.hits.length,
      inDomain,
      outOfDomain,
      documentsSelected: 0,
      primarySourcesFound: 0,
      outside: rows.filter((row) => row.retrievalStatus === "rejected").map((row) => ({ url: row.url, reason: row.rejectionReason || "Outside this stage." })),
    });
    await input.onInventory?.(rows);
  }

  return {
    attempted,
    inventory,
    outside,
    errors: errors.slice(0, 4),
    stop,
    documentsSelected: 0,
  };
}
