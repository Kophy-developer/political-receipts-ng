import type { SourceQuality } from "@/lib/editorial/quality";
import { contentPillarFromStorage, type ContentPillar } from "@/lib/pillars/catalog";

function clip(value: string, max = 240) {
  const text = value.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function economicFigure(text: string) {
  return /\d/.test(text) && /\b(percent|per cent|%|naira|₦|inflation|mpr|interest rate|exchange rate|basis point|billion|million|trillion)\b|(?:tn|bn|trn)\b/i.test(text);
}

function financeReading(text: string, quality: SourceQuality): SourceQuality {
  if (!economicFigure(text)) return quality.matched ? quality : {
    ...quality,
    matched: true,
    summary: "The post is a judgment about the economy. It does not cite a figure.",
    primaryKind: "opinion",
    routes: ["OPINION", "REACTION"],
    researchNeed: "no",
    reason: "There is no figure to look up. No outside record is required to respond to the judgment.",
    checkableFacts: [],
    draftingCandidate: true,
    review: null,
  };
  const sentence = text.split(/(?<=[.!?])\s+/).find((line) => economicFigure(line)) ?? text;
  const figure = clip(sentence);
  return {
    matched: true,
    summary: `The post cites a figure: ${figure}`,
    primaryKind: "factual_assertion",
    routes: ["CHECK", "ANALYSIS", "ORIGINAL_INSIGHT"],
    researchNeed: "yes",
    reason: "Keep the unit, the reporting period, and the definition with the figure. A named office has to have published it.",
    checkableFacts: [figure],
    lowValue: false,
    draftingCandidate: false,
    review: null,
  };
}

function footballReading(text: string, quality: SourceQuality): SourceQuality {
  const rumour = /\b(linked with|in talks|could sign|set to sign|according to reports|rumour|rumou?r|interest in)\b/i.test(text);
  const official = /\b(the club (says|confirms|confirmed)|manchester united (says|confirmed)|premier league confirmed|uefa confirmed)\b/i.test(text);
  const score = /\b\d{1,2}\s*[-–]\s*\d{1,2}\b/.test(text);
  const game = /\b(efootball|video game|in the game|mobile game)\b/i.test(text);
  const record = /\b(scored|conceded|won|lost|drawn|signed|injured|sidelined)\b/i.test(text) && /\d/.test(text);
  if (game && (score || record)) {
    return {
      matched: true,
      summary: "The score is inside a game. It is not a Manchester United match result.",
      primaryKind: "opinion",
      routes: ["OPINION", "REACTION"],
      researchNeed: "no",
      reason: "A game score is not a club result. Do not write it as a match fact.",
      checkableFacts: [],
      lowValue: false,
      draftingCandidate: true,
      review: null,
    };
  }
  if (rumour && !official) {
    return {
      matched: true,
      summary: "The post is passing on a transfer or injury report. That report is not a completed signing or a confirmed injury.",
      primaryKind: "opinion",
      routes: ["OPINION", "REACTION"],
      researchNeed: "no",
      reason: "A report is not a confirmed transfer or injury. Do not write it as fact.",
      checkableFacts: [],
      lowValue: false,
      draftingCandidate: true,
      review: null,
    };
  }
  if (score || official || record) {
    return {
      matched: true,
      summary: quality.matched ? quality.summary : `The post reports a club fact: ${clip(text)}`,
      primaryKind: "event",
      routes: ["REACTION", "ANALYSIS"],
      researchNeed: official ? "yes" : "recommended",
      reason: "A score, signing, or injury needs Manchester United, the Premier League, UEFA, or the FA. Do not state it without that record.",
      checkableFacts: [clip(text)],
      lowValue: false,
      draftingCandidate: true,
      review: null,
    };
  }
  return {
    matched: true,
    summary: "The post is a supporter's reaction. It does not state a score, a signing, or an injury as fact.",
    primaryKind: "reaction",
    routes: ["REACTION", "OPINION"],
    researchNeed: "no",
    reason: "This is a football reaction. It is not sent through a political fact-check.",
    checkableFacts: [],
    lowValue: false,
    draftingCandidate: true,
    review: null,
  };
}

export function storyQuality(sourceText: string, pillar: string | null | undefined, described: SourceQuality): SourceQuality {
  return readingForPillar(contentPillarFromStorage(pillar) ?? "politics", sourceText, described);
}

/** Politics keeps the shared source reading. Finance and United do not inherit a political template. */
export function readingForPillar(pillar: ContentPillar, sourceText: string, quality: SourceQuality): SourceQuality {
  const text = sourceText.replace(/\s+/g, " ").trim();
  if (!text) return quality;
  if (pillar === "manchester_united") return footballReading(text, quality);
  if (pillar === "finance") return financeReading(text, quality);
  return quality;
}
