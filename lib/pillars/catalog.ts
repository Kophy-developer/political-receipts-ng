import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";

/** Editorial names. Stored rows keep `football` for Manchester United. */
export const contentPillars = ["politics", "finance", "manchester_united"] as const;

export type ContentPillar = (typeof contentPillars)[number];

export type StoragePillar = "politics" | "finance" | "football";

export const pillarTargets: Record<ContentPillar, number> = {
  politics: 60,
  finance: 20,
  manchester_united: 20,
};

export const pillarLabels: Record<ContentPillar, string> = {
  politics: "Politics",
  finance: "Finance",
  manchester_united: "Manchester United",
};

export const pillarMixLabels: Record<ContentPillar, string> = {
  politics: "Politics",
  finance: "Finance",
  manchester_united: "Man United",
};

export const scanModes = ["smart", ...contentPillars] as const;

export type ScanMode = (typeof scanModes)[number];

export function storagePillar(pillar: ContentPillar): StoragePillar {
  if (pillar === "manchester_united") return "football";
  return pillar;
}

export function contentPillarFromStorage(value: string | null | undefined): ContentPillar | null {
  if (value === "politics" || value === "finance") return value;
  if (value === "football" || value === "manchester_united") return "manchester_united";
  return null;
}

export function isScanMode(value: unknown): value is ScanMode {
  return value === "smart" || value === "politics" || value === "finance" || value === "manchester_united";
}

/** One account. The tone changes. The person does not. */
export const pillarVoice: Record<ContentPillar, string> = {
  politics: "The same person. Curious, evidence-conscious, and conversational. Attribute a claim to the person who made it. Do not forecast an election.",
  finance: "The same person. Numerically informed, thoughtful, and practical. Explain a figure simply, and keep its unit, period, and definition. Do not give investment advice to a named person.",
  manchester_united: "The same person. A supporter: conversational, and occasionally funny or frustrated. Do not invent a personal reaction, a transfer, or an injury. A rumour is not a transfer.",
};

export const researchSources: Record<ContentPillar, string> = {
  politics: "A factual assertion prefers the office that owns the record.",
  finance: "A number prefers CBN, NBS, DMO, Budget Office, NGX, SEC, IMF, World Bank, or the publisher of that figure.",
  manchester_united: "A match fact prefers Manchester United, the Premier League, UEFA, or the FA. A reaction to the match does not need a dossier.",
};

const favoured: Record<ContentPillar, OpportunityType[]> = {
  politics: ["reaction", "opinion", "check", "analysis", "original_insight", "humour", "question"],
  finance: ["analysis", "original_insight", "check", "opinion", "question"],
  manchester_united: ["reaction", "opinion", "humour", "question", "analysis"],
};

export function favouredTypes(pillar: ContentPillar) {
  return favoured[pillar];
}

export function researchExpectation(pillar: ContentPillar, type: OpportunityType, factual: boolean): ResearchNeed {
  if (type === "check") return "yes";
  if (pillar === "finance" && factual && (type === "analysis" || type === "original_insight")) return "yes";
  if (pillar === "politics" && factual && (type === "analysis" || type === "original_insight")) return "yes";
  if (pillar === "manchester_united" && (type === "reaction" || type === "opinion" || type === "humour" || type === "question")) return "no";
  if (type === "reaction" || type === "opinion" || type === "humour") return "no";
  return factual ? "recommended" : "no";
}

export function needsEvidence(pillar: ContentPillar, type: OpportunityType, factual: boolean) {
  return researchExpectation(pillar, type, factual) === "yes";
}

/** Editorial tags stay optional. They are not added to the text, and they are not suggested for United. */
export function maySuggestEditorialTag(pillar: ContentPillar) {
  return pillar !== "manchester_united";
}

export function withOptionalTag(text: string) {
  return text;
}

export type DiscoveryQuery = {
  slug: string;
  name: string;
  query: string;
  terms: string[];
};

/** The politics query already installed. It is not replaced or folded into another pillar. */
export const preservedPoliticsQuery = '(INEC OR "Independent National Electoral Commission") ("voter register" OR PVC OR "polling unit" OR collation OR result) (Nigeria OR Nigerian) -is:retweet';

export const politicsDiscovery = {
  pillar: "politics" as const,
  scope: "Nigerian politics/public affairs",
  preserveExisting: true,
  queries: [
    {
      slug: "inec",
      name: "INEC",
      query: preservedPoliticsQuery,
      terms: ["inec", "pvc", "voter register", "polling unit"],
    },
  ] satisfies DiscoveryQuery[],
};

export const financeDiscovery = {
  pillar: "finance" as const,
  scope: "Finance and economics",
  preserveExisting: false,
  queries: [
    {
      slug: "finance-cbn",
      name: "CBN and the naira",
      query: '(CBN OR "Central Bank of Nigeria" OR naira OR MPR) (inflation OR forex OR "interest rate" OR "monetary policy") -is:retweet',
      terms: ["cbn", "naira", "mpr", "inflation", "interest rate"],
    },
    {
      slug: "finance-debt",
      name: "Debt and the budget",
      query: '(DMO OR "debt service" OR "public debt" OR "Budget Office" OR appropriation) (Nigeria OR budget OR borrowing) -is:retweet',
      terms: ["dmo", "public debt", "budget office", "appropriation"],
    },
    {
      slug: "finance-markets",
      name: "Markets and banking",
      query: '(NGX OR "Central Bank" OR SEC OR banking OR "foreign investment") (Nigeria OR shares OR market) -is:retweet',
      terms: ["ngx", "sec", "banking", "foreign investment"],
    },
    {
      slug: "finance-global",
      name: "Global economy, when it reaches us",
      query: '(IMF OR "World Bank" OR "oil price" OR recession) (Nigeria OR naira OR economy) -is:retweet',
      terms: ["imf", "world bank", "oil price"],
    },
  ] satisfies DiscoveryQuery[],
};

export const manchesterDiscovery = {
  pillar: "manchester_united" as const,
  scope: "Manchester United",
  preserveExisting: false,
  rumourIsNotAFact: true,
  queries: [
    {
      slug: "united-match",
      name: "Match",
      query: '("Manchester United" OR #MUFC OR #GGMU) (goal OR match OR "Premier League" OR scored OR lineup) -is:retweet',
      terms: ["manchester united", "mufc", "premier league", "goal"],
    },
    {
      slug: "united-team",
      name: "Team and manager",
      query: '("Manchester United" OR #MUFC) (manager OR tactic OR injury OR squad OR "Old Trafford") -is:retweet',
      terms: ["manchester united", "manager", "injury", "old trafford"],
    },
    {
      slug: "united-club",
      name: "Club news",
      query: '("Manchester United" OR #MUFC) (transfer OR signing OR contract OR "club statement") -is:retweet',
      terms: ["manchester united", "transfer", "contract"],
    },
    {
      slug: "united-finances",
      name: "Club finances",
      query: '("Manchester United" OR #MUFC) (revenue OR wages OR "financial results" OR sponsorship OR "club debt") -is:retweet',
      terms: ["manchester united", "revenue", "wages", "financial results"],
    },
  ] satisfies DiscoveryQuery[],
};

export function discoveryFor(pillar: ContentPillar) {
  if (pillar === "finance") return financeDiscovery;
  if (pillar === "manchester_united") return manchesterDiscovery;
  return politicsDiscovery;
}

export function queriesStaySeparate() {
  const politics = politicsDiscovery.queries.map((item) => item.query);
  const finance = financeDiscovery.queries.map((item) => item.query);
  const united = manchesterDiscovery.queries.map((item) => item.query);
  const combined = [...politics, ...finance, ...united].join("\n");
  return {
    politics,
    finance,
    united,
    onePoliticsQuery: politics[0] === preservedPoliticsQuery,
    financeSkipsUnited: finance.every((query) => !/manchester united|#mufc/i.test(query)),
    unitedSkipsInec: united.every((query) => !/\binec\b/i.test(query)),
    noCombinedQuery: !/manchester united/i.test(politics.join(" ")) && !combined.includes(preservedPoliticsQuery + " OR \"Manchester United\""),
  };
}
