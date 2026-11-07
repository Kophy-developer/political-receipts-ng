import { hashOfPlan, stageLabel } from "@/lib/research/canonical";
import { chooseDocumentIds } from "@/lib/research/examine";
import type { Investigation } from "@/lib/research/investigate";
import type { StoredResearchPlan } from "@/lib/research/types";

export const continuationPlanner = "phase2-statistics";

export const researchBlockers = [
  "No relevant source found",
  "Document could not be opened",
  "Table unavailable",
  "Series incomplete",
  "Incompatible definitions",
  "Provider or budget failure",
] as const;

export type ResearchBlocker = (typeof researchBlockers)[number];

export type ContinuationSource = {
  id?: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string | null;
  opened?: boolean;
  text?: string | null;
  retrievalStatus?: string;
  inDomain?: boolean;
  rejection?: string | null;
};

export type ContinuationRun = {
  hash: string | null;
  status: string;
  operations: number;
};

export type ContinuationOffer = {
  available: boolean;
  question: string;
  why: string;
  searches: number;
  documents: number;
  searchesRemaining: number;
  documentsRemaining: number;
  blocker: ResearchBlocker | null;
  plan: StoredResearchPlan | null;
  planKey: string | null;
  openIds: string[];
};

const caps = { maxSearches: 3, maxDocuments: 2, dailySearches: 12, dailyRetrievals: 20 };

function hostOf(domain: string) {
  return domain.toLowerCase().replace(/^www\./, "");
}

function questionFor(investigation: Investigation) {
  return investigation.questions.find((item) => item.purpose === "historical_comparison")?.question
    || investigation.questions.find((item) => item.purpose === "numerical_analysis")?.question
    || investigation.questions[0]?.question
    || "What do the records show?";
}

function statisticalQueries(investigation: Investigation) {
  const lead = questionFor(investigation);
  const threeYear = investigation.questions.find((item) => item.purpose === "numerical_analysis")?.question || lead;
  const definitions = investigation.questions.find((item) => item.purpose === "context")?.question || lead;
  if (investigation.focusSeries) {
    return [
      { query: "Nigeria capital importation National Bureau of Statistics annual", question: lead },
      { query: "Nigeria foreign direct investment UNCTAD", question: definitions },
      { query: "Nigeria capital importation Central Bank of Nigeria", question: threeYear },
    ];
  }
  return investigation.questions.slice(0, caps.maxSearches).map((item) => ({
    query: item.question.replace(/\s+/g, " ").trim().slice(0, 180),
    question: item.question,
  }));
}

export function continuationPlan(input: {
  claim: string;
  investigation: Investigation;
  providerId: "tavily" | "brave";
}): StoredResearchPlan {
  const domains = [...input.investigation.preferredHosts];
  const stage = domains.length ? "primary" as const : "context" as const;
  const queries = statisticalQueries(input.investigation).slice(0, caps.maxSearches);
  const questions = input.investigation.questions.map((item) => ({
    problem: "record" as const,
    question: item.question,
    authority: domains[0] || "Primary record",
  }));
  const searches = queries.map((item) => ({
    problem: "record" as const,
    question: item.question,
    query: item.query,
    authority: domains[0] || "Primary record",
    domains,
    stage,
    stageLabel: stageLabel(stage),
  }));
  return {
    version: 1,
    planner: continuationPlanner,
    claim: input.claim,
    stage,
    cursor: 0,
    awaitingReview: false,
    authority: domains.length ? "Statistical series" : "Broader context",
    domains,
    providerId: input.providerId,
    questions,
    variants: searches.map((item) => ({ problem: item.problem, question: item.question, query: item.query })),
    searches,
    direct: { domains: domains.slice(0, 1), terms: [], maxEntryPages: 1, maxFollowedLinks: 1 },
  };
}

export function continuationBlocker(input: { investigation: Investigation; sources: ContinuationSource[] }): ResearchBlocker {
  const opened = input.sources.filter((item) => item.opened);
  const unreadable = opened.filter((item) => item.text != null && item.text.trim().length > 0 && /could not be read|not invented/i.test(item.text));
  if (!input.sources.length) return "No relevant source found";
  if (opened.length > 0 && opened.every((item) => !item.text?.trim())) return "Document could not be opened";
  if (unreadable.length === opened.length && opened.length > 0) return "Document could not be opened";
  if (input.investigation.numerical && opened.length > 0 && !input.sources.some((item) => /<table|year\s*\|/i.test(item.text || ""))) return "Table unavailable";
  if (input.investigation.numerical && input.sources.some((item) => /not treated as the same measurement|do not share a unit/i.test(item.text || ""))) return "Incompatible definitions";
  if (input.investigation.numerical) return "No relevant source found";
  return "No relevant source found";
}

function whyFor(investigation: Investigation, sources: ContinuationSource[]) {
  const substitutes = sources.filter((item) => investigation.rejectedSubstitutes.some((host) => hostOf(item.domain).endsWith(host)));
  const opened = sources.filter((item) => item.opened).length;
  if (investigation.numerical && substitutes.length && substitutes.length === sources.length) {
    return `${substitutes.length} saved results are State House announcements. Search completed, and ${opened} documents were opened. An announcement is not a historical statistical series.`;
  }
  if (!sources.length) return "No search result is stored for this question.";
  if (opened === 0) return "Search results are stored. No document was opened, so none of them is evidence.";
  return "The opened pages do not contain a usable series for this question.";
}

export function describeContinuation(input: {
  claim: string;
  investigation: Investigation;
  sources: ContinuationSource[];
  runs: ContinuationRun[];
  continuations: number;
  published?: boolean;
  ready?: boolean;
  searchCompleted?: boolean;
  evidenceReady?: boolean;
  providerId?: "tavily" | "brave";
  searchesUsed?: number;
  retrievalsUsed?: number;
  maxSearchesPerRun?: number;
  maxDocumentsPerRun?: number;
  dailySearches?: number;
  dailyRetrievals?: number;
}): ContinuationOffer {
  const providerId = input.providerId ?? "tavily";
  const searchesRemaining = Math.max(0, (input.dailySearches ?? caps.dailySearches) - (input.searchesUsed ?? 0));
  const documentsRemaining = Math.max(0, (input.dailyRetrievals ?? caps.dailyRetrievals) - (input.retrievalsUsed ?? 0));
  const question = questionFor(input.investigation);
  const why = whyFor(input.investigation, input.sources);
  const empty: ContinuationOffer = {
    available: false,
    question,
    why,
    searches: 0,
    documents: 0,
    searchesRemaining,
    documentsRemaining,
    blocker: null,
    plan: null,
    planKey: null,
    openIds: [],
  };
  if (input.published) return { ...empty, why: "A published story stays published." };
  if (input.ready) return { ...empty, why: "A draft is already in Ready for You. Publishing still requires the exact text." };
  if (input.evidenceReady) return { ...empty, why: "Opened evidence is already stored. Develop content can continue the draft. This action does not search again." };
  if (!input.runs.length && !input.searchCompleted) return { ...empty, why: "Research has not started. Develop content shows the cost before the first search." };
  const plan = continuationPlan({ claim: input.claim, investigation: input.investigation, providerId });
  const planKey = hashOfPlan(plan, providerId);
  const completed = new Set(input.runs.filter((run) => run.operations > 0 && (run.status === "completed" || run.status === "stopped")).map((run) => run.hash));
  const eitherProvider = completed.has(planKey) || completed.has(hashOfPlan(plan, providerId === "tavily" ? "brave" : "tavily"));
  const openIds = chooseDocumentIds(input.sources.flatMap((item) => item.id ? [{
    id: item.id,
    url: item.url,
    title: item.title,
    domain: item.domain,
    snippet: item.snippet,
    retrievalStatus: item.retrievalStatus,
    inDomain: item.inDomain,
    rejection: item.rejection,
  }] : []), input.investigation, input.maxDocumentsPerRun ?? caps.maxDocuments).filter((id) => input.sources.some((item) => item.id === id && item.retrievalStatus !== "retrieved" && item.opened !== true));
  const failed = input.sources.filter((item) => item.retrievalStatus === "failed");
  const attempt = failed.length
    ? `The latest retrieval attempt did not open a series. ${failed.map((item) => `${item.title}: ${item.rejection || "The page was not stored."}`).join(" ")}`
    : why;
  if (openIds.length) {
    const documents = Math.min(openIds.length, input.maxDocumentsPerRun ?? caps.maxDocuments, documentsRemaining);
    const next = input.sources.find((item) => item.id === openIds[0]);
    const nextTitle = next?.title || "the next saved document";
    const again = /too large to store an excerpt/i.test(next?.rejection || "");
    if (documents < 1) return { ...empty, blocker: "Provider or budget failure", why: `${attempt} The daily document limit is reached.` };
    return {
      ...empty,
      available: true,
      why: `${attempt} The next saved document is “${nextTitle}”. ${again ? "That file was not stored. Opening it downloads the PDF again and counts against the daily document limit." : "No new search is required."}`,
      searches: 0,
      documents,
      openIds: openIds.slice(0, documents),
      plan: null,
      planKey: null,
    };
  }
  if (input.continuations >= 2 || eitherProvider) {
    const none = `No usable statistical document remains among the ${input.sources.length} saved results. The same search plan will not run again.`;
    return { ...empty, blocker: failed.length ? "Document could not be opened" : continuationBlocker(input), plan, planKey, why: `${attempt} ${none}` };
  }
  const searches = Math.min(plan.searches.length, input.maxSearchesPerRun ?? caps.maxSearches, searchesRemaining);
  const documents = Math.min(input.maxDocumentsPerRun ?? caps.maxDocuments, documentsRemaining);
  if (searches < 1 || documents < 1) {
    return { ...empty, blocker: "Provider or budget failure", plan, planKey, why: `${why} The daily research limit is reached.` };
  }
  return { ...empty, available: true, why, searches, documents, plan, planKey, openIds: [] };
}
