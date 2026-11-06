export type SourceStance = "supports" | "contradicts" | "contextualizes" | "does_not_address";

export type EvidenceStatus = "RELEVANT_EVIDENCE_FOUND" | "EVIDENCE_INSUFFICIENT" | "EVIDENCE_READY";

export type SearchStatus = "SEARCH_COMPLETED";

export type FailureKind =
  | "story-specific validation"
  | "source relevance"
  | "inadequate evidence"
  | "unsupported statement"
  | "invalid draft structure";

const weak = new Set([
  "about", "after", "again", "also", "been", "being", "best", "bola", "budget", "claim", "could",
  "country", "development", "does", "drove", "each", "economic", "economy", "education", "federal",
  "from", "fund", "funding", "government", "have", "house", "independent", "infrastructure",
  "into", "minister", "national", "nigeria", "nigerian", "official", "people", "post", "president",
  "public", "said", "says", "school", "state", "that", "their", "there", "these", "this", "those",
  "tinubu", "under", "universities", "university", "what", "when", "where", "which", "with",
  "would", "ahmed",
]);

function words(value: string) {
  return [...value.toLowerCase().matchAll(/[a-z][a-z0-9]{3,}/g)].map((match) => match[0]);
}

function numbers(value: string) {
  return [...value.matchAll(/\b\d{2,6}\b/g)].map((match) => match[0]);
}

/** Terms that identify the premise rather than the office, the person, or a broad sector. */
export function premiseTerms(premise: string) {
  const distinctive = [...new Set(words(premise).filter((word) => word.length >= 4 && !weak.has(word)))];
  return { distinctive, figures: [...new Set(numbers(premise))] };
}

export function assessSource(input: {
  premises: string[];
  title: string;
  url: string;
  domain: string;
  snippet?: string | null;
  opened?: boolean;
  text?: string | null;
}) {
  const opened = input.opened === true;
  const premises = input.premises.filter((premise) => premise.trim());
  const visible = `${input.title}\n${input.snippet ?? ""}`;
  const readable = opened ? `${visible}\n${input.text ?? ""}` : visible;
  let premise = premises[0] ?? "";
  let matched = false;
  for (const candidate of premises) {
    const terms = premiseTerms(candidate);
    const haystack = readable.toLowerCase();
    const hit = terms.figures.some((figure) => readable.includes(figure))
      || terms.distinctive.some((term) => haystack.includes(term));
    if (hit) {
      premise = candidate;
      matched = true;
      break;
    }
  }
  if (!matched) {
    return {
      title: input.title,
      url: input.url,
      domain: input.domain,
      snippet: input.snippet ?? null,
      opened,
      premise,
      stance: "does_not_address" as const,
      limitation: "The title and snippet do not address the premise. A reputable domain is not relevance.",
    };
  }
  if (!opened) {
    return {
      title: input.title,
      url: input.url,
      domain: input.domain,
      snippet: input.snippet ?? null,
      opened: false,
      premise,
      stance: "contextualizes" as const,
      limitation: "A search snippet mentions the premise. The page was not opened, so it is not proof of its contents.",
    };
  }
  const body = `${input.text ?? ""}\n${input.snippet ?? ""}`;
  const contradicts = /\b(no record|not true|did not|didn't|denies|denied|there is no|cannot find)\b/i.test(body);
  return {
    title: input.title,
    url: input.url,
    domain: input.domain,
    snippet: input.snippet ?? null,
    opened: true,
    premise,
    stance: (contradicts ? "contradicts" : "contextualizes") as SourceStance,
    limitation: contradicts
      ? "An opened page addresses the premise and does not simply confirm it."
      : "An opened page addresses the premise. That is context, not a verdict.",
  };
}

export function classifyEvidence(input: {
  premises: string[];
  sources: Array<{ title: string; url: string; domain: string; snippet?: string | null; opened?: boolean; text?: string | null }>;
  searchCompleted: boolean;
}) {
  const readings = input.sources.map((source) => assessSource({ premises: input.premises, ...source }));
  const openedRelevant = readings.some((source) => source.opened && source.stance !== "does_not_address");
  const mentioned = readings.some((source) => source.stance !== "does_not_address");
  const evidenceStatus: EvidenceStatus = openedRelevant
    ? "EVIDENCE_READY"
    : mentioned
      ? "RELEVANT_EVIDENCE_FOUND"
      : "EVIDENCE_INSUFFICIENT";
  const searchStatus: SearchStatus | null = input.searchCompleted ? "SEARCH_COMPLETED" : null;
  const label = evidenceStatus === "EVIDENCE_READY" ? "usable" as const : readings.length ? "insufficient" as const : "none" as const;
  const failureKind: FailureKind | null = evidenceStatus === "EVIDENCE_READY"
    ? null
    : evidenceStatus === "RELEVANT_EVIDENCE_FOUND"
      ? "inadequate evidence"
      : "source relevance";
  return { readings, evidenceStatus, searchStatus, label, failureKind };
}
