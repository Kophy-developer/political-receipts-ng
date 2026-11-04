import { hostInDomains, hostname, isSocialHost, partitionHits } from "@/lib/research/filter";
import { officialEntryUrl, officialLinks } from "@/lib/research/official";
import type { SearchStage } from "@/lib/research/types";

export type StageHit = { url: string; title: string; description: string; published: string | null };

export type StageDocument = {
  url: string;
  domain: string;
  title: string;
  published: string | null;
  passage: string;
  question: string;
  problem: string;
  query: string;
  social: boolean;
};

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
  primaryDomains: string[];
  searches: Array<{ query: string; question: string; problem: string; domains: string[] }>;
  search: (query: string, domains: string[]) => Promise<SearchAnswer>;
  retrieve: (url: string) => Promise<{ ok: true; url: string; domain: string; title: string; published: string | null; passage: string } | { ok: false; message: string }>;
  readHtml?: (url: string) => Promise<{ ok: true; url: string; html: string } | { ok: false; message: string }>;
  direct: { domains: string[]; terms: string[]; maxEntryPages: number; maxFollowedLinks: number } | null;
  maxDocuments: number;
  onSearch?: (metric: SearchMetric) => Promise<void> | void;
}) {
  const documents: StageDocument[] = [];
  const outside: Array<{ url: string; reason: string }> = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let attempted = 0;
  let stop: "unavailable" | "rejected" | null = null;
  let eligibleHits = 0;

  const take = async (url: string, question: string, problem: string, query: string) => {
    if (documents.length >= input.maxDocuments || seen.has(url)) return false;
    seen.add(url);
    const page = await input.retrieve(url);
    if (!page.ok) {
      errors.push(page.message);
      return false;
    }
    const host = page.domain || hostname(page.url) || "";
    if ((input.stage === "primary" || input.stage === "independent") && (!hostInDomains(host, input.domains) || isSocialHost(host))) {
      outside.push({ url: page.url, reason: `${host || "That host"} is outside this stage after retrieval.` });
      return false;
    }
    documents.push({
      url: page.url,
      domain: host,
      title: page.title,
      published: page.published,
      passage: page.passage,
      question,
      problem,
      query,
      social: isSocialHost(host),
    });
    return true;
  };

  for (const item of input.searches) {
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
    const split = partitionHits(result.hits, input.stage, domains);
    eligibleHits += split.eligible.length;
    const room = input.maxDocuments - documents.length;
    const selected = split.eligible.slice(0, Math.max(0, room));
    let primarySourcesFound = 0;
    for (const hit of selected) {
      const before = documents.length;
      const filed = await take(hit.url, item.question, item.problem, item.query);
      if (filed && documents.length > before && hostInDomains(documents[documents.length - 1].domain, input.primaryDomains)) primarySourcesFound += 1;
    }
    outside.push(...split.rejected);
    await input.onSearch?.({
      query: item.query,
      domains,
      ok: true,
      cause: null,
      message: null,
      credits: result.credits,
      resultsReturned: result.hits.length,
      inDomain: split.inDomain,
      outOfDomain: split.outOfDomain,
      documentsSelected: selected.length,
      primarySourcesFound,
      outside: split.rejected,
    });
  }

  const inspections: string[] = [];
  if (!stop && input.stage === "primary" && eligibleHits === 0 && documents.length === 0 && input.readHtml && input.direct && input.direct.maxEntryPages > 0) {
    const domain = input.direct.domains[0];
    const entry = domain ? officialEntryUrl(domain) : "";
    if (entry) {
      inspections.push(entry);
      const page = await input.readHtml(entry);
      if (page.ok && documents.length < input.maxDocuments) {
        const links = officialLinks(page.html, page.url, input.direct.domains, input.direct.terms, input.direct.maxFollowedLinks);
        for (const link of links) {
          if (documents.length >= input.maxDocuments) break;
          await take(link, input.searches[0]?.question || "What does the official record say?", input.searches[0]?.problem || "record", input.searches[0]?.query || "official record");
        }
      } else if (!page.ok) {
        errors.push(page.message);
      }
    }
  }

  const found = documents.some((item) => !item.social && hostInDomains(item.domain, input.primaryDomains));
  return {
    attempted,
    documents,
    outside: outside.slice(0, 8),
    errors: errors.slice(0, 4),
    stop,
    inspections,
    outcome: input.stage === "primary" && attempted > 0 ? (found ? "PRIMARY SOURCE FOUND" as const : "PRIMARY SOURCE NOT FOUND" as const) : null,
  };
}
