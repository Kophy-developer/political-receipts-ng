import { hostInDomains, isSocialHost } from "@/lib/research/filter";
import type { EvidenceQualityLabel, PlannedQuestion } from "@/lib/research/types";

export function authorityShort(name: string) {
  if (/Independent National Electoral Commission/i.test(name)) return "INEC";
  if (/National Bureau of Statistics/i.test(name)) return "NBS";
  if (/Central Bank of Nigeria/i.test(name)) return "CBN";
  if (/Debt Management Office/i.test(name)) return "DMO";
  if (/Budget Office/i.test(name)) return "Budget Office";
  const part = name.split(";")[0]?.trim() || "the office";
  return part.length > 48 ? "the office" : part;
}

export function evidenceQuality(input: {
  authority: string;
  primaryDomains: string[];
  sources: Array<{ domain: string; tierRank: number }>;
}): { label: EvidenceQualityLabel; reason: string } {
  const short = authorityShort(input.authority);
  if (input.sources.length === 0) {
    return { label: "INSUFFICIENT", reason: "No document has been retrieved." };
  }
  const primary = input.sources.some((source) => source.domain && hostInDomains(source.domain, input.primaryDomains) && !isSocialHost(source.domain));
  if (primary) {
    return {
      label: "PRIMARY RECORD",
      reason: `A page on the ${short} domain was retrieved. It stays context until an editor accepts a reading of it.`,
    };
  }
  const secondary = input.sources.some((source) => source.tierRank > 0 && source.tierRank <= 2 && source.domain && !isSocialHost(source.domain));
  if (secondary) {
    return {
      label: "STRONG SECONDARY",
      reason: "An independent report was retrieved. It is not the office that owns the record.",
    };
  }
  const socialOnly = input.sources.every((source) => source.domain && isSocialHost(source.domain));
  if (socialOnly) {
    return {
      label: "CONTEXT ONLY",
      reason: `No ${short} record was retrieved. The available sources are social-media pages and cannot establish the factual allegation.`,
    };
  }
  return {
    label: "CONTEXT ONLY",
    reason: `No ${short} record was retrieved. The pages on file do not settle the claim.`,
  };
}

export function problemReadings(questions: PlannedQuestion[], pack: EvidenceQualityLabel) {
  return questions.map((item) => {
    if (item.problem === "attribution") {
      return {
        question: item.question,
        label: pack === "INSUFFICIENT" ? ("INSUFFICIENT" as const) : ("CONTEXT ONLY" as const),
        reason: "Who first made the accusation is a separate question from whether the role or the act is on the record.",
      };
    }
    if (item.problem === "record") {
      return {
        question: item.question,
        label: "INSUFFICIENT" as const,
        reason: pack === "PRIMARY RECORD"
          ? "A primary page is on file. It has not been matched to this question, and it is not a verdict."
          : "No authoritative page has established the role.",
      };
    }
    if (item.problem === "allegation") {
      return {
        question: item.question,
        label: "INSUFFICIENT" as const,
        reason: pack === "PRIMARY RECORD"
          ? "A primary page is on file. It has not been matched to this allegation, and it is not a verdict."
          : "No authoritative page has addressed the allegation.",
      };
    }
    return {
      question: item.question,
      label: pack,
      reason: "This question stays separate. The pack summary is not a verdict.",
    };
  });
}
