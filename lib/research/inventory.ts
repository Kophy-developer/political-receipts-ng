import { tierForHost } from "@/lib/research/tiers";

export type RetrievalStatus = "not_retrieved" | "retrieved" | "rejected" | "failed";

export type StoredSearchResult = {
  id: string;
  researchRunId: string;
  claimId: string;
  provider: string;
  question: string;
  query: string;
  resultRank: number;
  title: string;
  url: string;
  domain: string;
  snippet: string | null;
  published: string | null;
  targetTier: string | null;
  inDomain: boolean;
  retrievalStatus: RetrievalStatus;
  rejectionReason: string | null;
  score: number;
  reason: string | null;
  recommended: boolean;
};

export type SearchResultDraft = {
  query: string;
  question: string;
  problem: string;
  queryIndex: number;
  resultRank: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  published: string | null;
  targetTier: string;
  tierRank: number;
  inDomain: boolean;
  retrievalStatus: RetrievalStatus;
  rejectionReason: string | null;
};

export type RankedResult = SearchResultDraft & {
  score: number;
  reason: string;
  recommended: boolean;
};

const stop = new Set([
  "about", "after", "again", "also", "authoritative", "been", "being", "claim", "could", "created", "does",
  "each", "evidence", "from", "have", "into", "that", "their", "there", "these", "this", "those", "what",
  "when", "where", "which", "with", "would", "your", "independent", "national", "commission",
]);

function words(value: string) {
  return [...value.toLowerCase().matchAll(/[a-z][a-z0-9]{3,}/g)]
    .map((match) => match[0])
    .filter((word) => !stop.has(word));
}

function numbers(value: string) {
  return [...value.matchAll(/\b\d{2,6}\b/g)].map((match) => match[0]);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function rankSearchResults(input: {
  claim: string;
  questions: string[];
  results: SearchResultDraft[];
  recommend?: number;
}): RankedResult[] {
  const claimNumbers = unique(numbers(`${input.claim} ${input.questions.join(" ")}`));
  const claimTerms = unique(words(`${input.claim} ${input.questions.join(" ")}`));
  const recommend = input.recommend ?? 2;
  const scored = input.results.map((result) => {
    if (!result.inDomain || result.retrievalStatus === "rejected") {
      return { ...result, score: 0, reason: result.rejectionReason || "Outside the target source.", recommended: false };
    }
    const title = result.title.toLowerCase();
    const snippet = result.snippet.toLowerCase();
    const url = result.url.toLowerCase();
    const haystack = `${title} ${snippet} ${url}`;
    let score = 0;
    const reasons: string[] = [];
    for (const figure of claimNumbers) {
      if (title.includes(figure)) {
        score += 50;
        reasons.push(`The title contains ${figure}.`);
      } else if (snippet.includes(figure)) {
        score += 32;
        reasons.push(`The snippet contains ${figure}.`);
      } else if (url.includes(figure)) {
        score += 20;
        reasons.push(`The address contains ${figure}.`);
      }
    }
    const titleTerms = claimTerms.filter((term) => title.includes(term));
    const snippetTerms = claimTerms.filter((term) => !title.includes(term) && snippet.includes(term));
    if (titleTerms.length) {
      score += titleTerms.length * 8;
      reasons.push(`Title uses ${titleTerms.slice(0, 4).join(", ")}.`);
    }
    if (snippetTerms.length) {
      score += snippetTerms.length * 4;
      reasons.push(`Snippet uses ${snippetTerms.slice(0, 4).join(", ")}.`);
    }
    let covered = 0;
    for (const question of input.questions) {
      const figures = numbers(question);
      const terms = unique(words(question)).slice(0, 8);
      const figureHit = figures.some((figure) => haystack.includes(figure));
      const termHits = terms.filter((term) => haystack.includes(term)).length;
      if (figureHit || termHits >= 2) covered += 1;
    }
    if (covered) {
      score += covered * 6;
      reasons.push(`It touches ${covered} research question${covered === 1 ? "" : "s"}.`);
    }
    score += Math.max(0, (5 - result.tierRank) * 3);
    if (result.targetTier) reasons.push(`Source tier: ${result.targetTier}.`);
    const year = result.published?.match(/20\d{2}/);
    if (year) {
      const value = Number(year[0]);
      if (value >= 2021) {
        score += 6;
        reasons.push(`Dated ${value}.`);
      } else if (value >= 2010) score += 2;
    }
    return {
      ...result,
      score,
      reason: reasons.join(" ") || "No figure or claim term appears in the title or snippet.",
      recommended: false,
    };
  });
  const eligible = scored
    .filter((result) => result.inDomain && result.retrievalStatus !== "rejected" && result.score > 0)
    .sort((left, right) => right.score - left.score || left.resultRank - right.resultRank || left.queryIndex - right.queryIndex);
  const chosen = new Set(eligible.slice(0, recommend).map((result) => `${result.query}#${result.resultRank}`));
  return scored
    .map((result) => ({ ...result, recommended: chosen.has(`${result.query}#${result.resultRank}`) }))
    .sort((left, right) => Number(right.recommended) - Number(left.recommended) || right.score - left.score || left.queryIndex - right.queryIndex || left.resultRank - right.resultRank);
}

export function describeCandidate(result: RankedResult) {
  const place = `Query ${result.queryIndex + 1}, result ${result.resultRank}`;
  return result.recommended ? `${place} is recommended. ${result.reason}` : `${place}. ${result.reason}`;
}

export { tierForHost };
