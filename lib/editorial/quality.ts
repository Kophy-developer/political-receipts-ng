import type { ResearchNeed } from "@/lib/opportunities/types";

export type QualityKind = "factual_assertion" | "event" | "opinion" | "prediction" | "question" | "reaction" | "humour" | "rhetoric" | "unclear";
export type QualityRoute = "CHECK" | "ANALYSIS" | "REACTION" | "OPINION" | "QUESTION" | "HUMOUR" | "ORIGINAL_INSIGHT";

export type SourceQuality = {
  matched: boolean;
  summary: string;
  primaryKind: QualityKind;
  routes: QualityRoute[];
  researchNeed: ResearchNeed;
  reason: string;
  checkableFacts: string[];
  lowValue: boolean;
  draftingCandidate: boolean;
  review: "Needs editorial review" | null;
};

const reviewLabel = "Needs editorial review" as const;

function clean(value: string) {
  return value.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
}

function sentences(value: string) {
  return clean(value)
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function clip(value: string, max = 240) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function isPredictionSentence(sentence: string) {
  const future = /\b(will|won't|will not|cannot survive|no way\b.*\bsurvive|might likely|might be the last|coming election)\b/i.test(sentence);
  const stake = /\b(election|vote|survive|tsunami|2027|president)\b/i.test(sentence);
  return future && stake;
}

function isReportedEvent(sentence: string) {
  return /\b(led|visited|met with)\b/i.test(sentence) && /\b(palace|sultan|delegation|adc)\b/i.test(sentence);
}

function premiseCore(sentence: string) {
  if (isPredictionSentence(sentence)) return false;
  if (/\b(is said to have|says he|says she|says they)\b/i.test(sentence) && /\b(paid|spent|drove|driven|attracted)\b/i.test(sentence)) return true;
  if (/\b(attracted|paid|spent)\b/i.test(sentence) && /(?:₦|\$|£)\s?\d|\b\d[\d,.]*(?:\s*(?:billion|million|thousand))\b/i.test(sentence)) return true;
  if (/\bbillboards?\b/i.test(sentence) && /\b(torn down|being torn|paid for|spent on)\b/i.test(sentence)) return true;
  if (/\bringtone\b/i.test(sentence) && /\b(whirling|playing|circulating)\b/i.test(sentence)) return true;
  if (/\b(invest(?:ing|ed)?|investment)\b/i.test(sentence) && /\b(compan(?:y|ies)|billion|million|economy|because of)\b/i.test(sentence)) return true;
  if (/\beconomy is the best\b/i.test(sentence)) return true;
  return false;
}

function isFactualPremise(sentence: string) {
  if (/\b(?:n't|not|no|never)\b/i.test(sentence)) return false;
  return premiseCore(sentence);
}

function negatesPremise(sentence: string) {
  if (isPredictionSentence(sentence)) return false;
  if (!/\b(?:n't|not|no|never)\b/i.test(sentence)) return false;
  return premiseCore(sentence.replace(/\b(?:n't|not|no|never)\b/gi, " "));
}

function isRhetoric(sentence: string) {
  if (isFactualPremise(sentence) || isReportedEvent(sentence) || isPredictionSentence(sentence)) return false;
  return /\b(terrorist organization|unity beggars|have destroyed|destroyed nigeria|fool(?:ish)?|idiot|stupid|useless man|moron)\b/i.test(sentence);
}

function isDenial(sentence: string) {
  return /\b(did not|didn't|never said|denies|denied|not true|no be say|calls that a lie|a lie)\b/i.test(sentence);
}

function reportedClause(text: string) {
  const match = clean(text).match(/\b(?:e tell me say|he told me(?: that)?|she told me(?: that)?|they told me(?: that)?|dem tell me say)\s+([^.!?]+)/i);
  return match ? match[1].trim() : null;
}

function rejectsReportedSpeech(text: string) {
  return /\b(block(?:ing)?|chop blocking|reason like that|na lie|i no agree|not true|calls that a lie)\b/i.test(text);
}

function quotedSpeech(text: string) {
  const match = clean(text).match(/[“"]([^”"]{12,})[”"]/);
  if (!match) return null;
  const speaker = clean(text).match(/[”"],?\s*((?:the\s+)?[A-Za-z][\w.'’]+(?:\s+[A-Za-z][\w.'’]+)?)\s+said/i);
  return { quote: match[1].trim(), speaker: speaker?.[1] ?? null };
}

function trailingCredit(text: string) {
  const match = clean(text).match(/^(.*?)(?:__|—)\s+((?:[A-Z][\w.'’]+)(?:\s+[A-Z][\w.'’]+){0,3})\s*$/);
  if (!match) return null;
  return { quote: match[1].trim().replace(/[.]+$/, ""), speaker: match[2].trim() };
}

function saysClaim(sentence: string) {
  const match = sentence.match(/^((?:[A-Z][\w.'’]*|The|A)(?:\s+[A-Za-z][\w.'’]+)*)\s+says\s+(.+)/);
  if (!match) return null;
  return { speaker: match[1].trim(), claim: match[2].replace(/[.]+$/, "").trim() };
}

function conflictingPoles(text: string) {
  const plain = clean(text);
  const positive = /\b(are investing|is investing|don dey invest|attracted|economy is the best)\b/i.test(plain);
  const negative = /\b(do not invest|don't invest|no foreign compan|economy is the worst|not the best)\b/i.test(plain);
  return positive && negative && !reportedClause(plain) && !quotedSpeech(plain);
}

function blank(summary: string): SourceQuality {
  return {
    matched: false,
    summary,
    primaryKind: "opinion",
    routes: [],
    researchNeed: "no",
    reason: "",
    checkableFacts: [],
    lowValue: false,
    draftingCandidate: true,
    review: null,
  };
}

export function describeSource(sourceText: string): SourceQuality {
  const text = clean(sourceText);
  if (!text) return blank("");
  const lines = sentences(text);
  const credit = trailingCredit(text);
  const reported = reportedClause(text);
  const quote = quotedSpeech(text);
  if (reported) {
    const claim = clip(reported);
    const premise = isFactualPremise(claim) || premiseCore(claim) || /\b(invest|economy)\b/i.test(claim);
    const rejected = rejectsReportedSpeech(text);
    return {
      matched: true,
      summary: rejected
        ? `The post rejects another person's claim that ${claim}. It does not assert that claim.`
        : `The post attributes this claim to another person: ${claim}. It does not present the claim as the post's own words.`,
      primaryKind: "opinion",
      routes: premise ? ["CHECK", "ANALYSIS", "OPINION"] : ["OPINION", "REACTION"],
      researchNeed: premise ? "yes" : "no",
      reason: premise
        ? "The reported sentence is a checkable premise. Research is required. The post is not treated as asserting it."
        : "The post is passing on another person's words. No separate record is required.",
      checkableFacts: premise ? [claim] : [],
      lowValue: false,
      draftingCandidate: !premise,
      review: null,
    };
  }
  if (quote) {
    const claim = clip(quote.quote);
    const premise = isFactualPremise(claim) || premiseCore(claim);
    const rejected = isDenial(text) || rejectsReportedSpeech(text);
    const who = quote.speaker ? `${quote.speaker} ` : "";
    return {
      matched: true,
      summary: rejected
        ? `The post quotes ${who}and rejects the claim “${claim}”. It does not assert that claim.`
        : `The post attributes this claim to ${quote.speaker ?? "another speaker"}: ${claim}. It does not present the claim as the post's own words.`,
      primaryKind: premise && !rejected ? "factual_assertion" : "opinion",
      routes: premise ? ["CHECK", "ANALYSIS", "OPINION"] : ["OPINION", "REACTION"],
      researchNeed: premise ? "yes" : "no",
      reason: premise
        ? "A quoted factual claim is separate from the post's own words. Research is required. The post is not treated as asserting it."
        : "The post is quoting another person. No outside record is required to respond to it.",
      checkableFacts: premise ? [claim] : [],
      lowValue: false,
      draftingCandidate: !premise,
      review: null,
    };
  }
  if (credit) {
    const claim = clip(credit.quote);
    const speculative = sentences(credit.quote).some(isPredictionSentence);
    const premise = isFactualPremise(credit.quote) || premiseCore(credit.quote);
    if (speculative && !premise) {
      return {
        matched: true,
        summary: `The post quotes ${credit.speaker} speculating that ${claim}. This is not a result.`,
        primaryKind: "prediction",
        routes: ["QUESTION", "ANALYSIS", "REACTION"],
        researchNeed: "no",
        reason: "This is a prediction, not a result. Do not forecast the election.",
        checkableFacts: [],
        lowValue: false,
        draftingCandidate: false,
        review: null,
      };
    }
    return {
      matched: true,
      summary: premise
        ? `The post attributes this claim to ${credit.speaker}: ${claim}.`
        : `The post quotes ${credit.speaker}: ${claim}.`,
      primaryKind: premise ? "factual_assertion" : "opinion",
      routes: premise ? ["CHECK", "ANALYSIS", "OPINION"] : ["OPINION", "REACTION"],
      researchNeed: premise ? "yes" : "no",
      reason: premise
        ? "A credited factual claim is in the stored text. Research is required. The post is not treated as the author's own assertion."
        : "The text is a quoted judgment. No outside record is required to respond to it.",
      checkableFacts: premise ? [claim] : [],
      lowValue: false,
      draftingCandidate: !premise,
      review: null,
    };
  }
  if (conflictingPoles(text)) {
    return {
      matched: true,
      summary: "The post makes conflicting claims and does not settle which one it is asserting.",
      primaryKind: "opinion",
      routes: ["OPINION", "QUESTION"],
      researchNeed: "no",
      reason: reviewLabel,
      checkableFacts: [],
      lowValue: false,
      draftingCandidate: false,
      review: reviewLabel,
    };
  }
  const predictions = lines.filter(isPredictionSentence);
  const events = lines.filter(isReportedEvent);
  const premises = lines.filter((sentence) => isFactualPremise(sentence) && !isDenial(sentence));
  const negated = lines.filter(negatesPremise);
  const rhetoric = lines.filter(isRhetoric);
  if (negated.length > 0 && premises.length === 0 && events.length === 0 && predictions.length === 0) {
    const claim = clip(negated[0].replace(/\b(did not say|didn't say|never said|denies that|denied that|n't|not|no|never)\b/gi, " ").replace(/\s+/g, " ").trim());
    return {
      matched: true,
      summary: `The post denies a claim: ${clip(negated.join(" "))} It does not assert that claim.`,
      primaryKind: "opinion",
      routes: ["CHECK", "ANALYSIS", "OPINION"],
      researchNeed: "yes",
      reason: "A denied factual sentence is still a premise. Research is required. The post is not treated as asserting it.",
      checkableFacts: [claim || clip(negated[0])],
      lowValue: false,
      draftingCandidate: false,
      review: null,
    };
  }
  if (predictions.length > 0 && premises.length === 0 && events.length === 0) {
    return {
      matched: true,
      summary: `The post speculates that ${clip(predictions.join(" "))} This is not a result.`,
      primaryKind: "prediction",
      routes: ["QUESTION", "ANALYSIS", "REACTION"],
      researchNeed: "no",
      reason: "This is a prediction, not a result. Do not forecast the election.",
      checkableFacts: [],
      lowValue: false,
      draftingCandidate: false,
      review: null,
    };
  }
  if (events.length > 0) {
    return {
      matched: true,
      summary: `The post reports that ${clip(events.join(" "))} The other lines are commentary.`,
      primaryKind: "event",
      routes: ["REACTION", "ANALYSIS"],
      researchNeed: "recommended",
      reason: "The event can be described now. Outside context would make the description clearer.",
      checkableFacts: events.map((sentence) => clip(sentence)),
      lowValue: false,
      draftingCandidate: true,
      review: null,
    };
  }
  if (premises.length > 0) {
    const attributed = premises.map(saysClaim).find((item) => item);
    const figure = premises.some((sentence) => /(?:₦|\$|£)\s?\d|\bbillion\b/i.test(sentence));
    const commentary = lines.filter((sentence) => !premises.includes(sentence));
    const summary = attributed
      ? `The post attributes this claim to ${attributed.speaker}: ${clip(attributed.claim)}.`
      : commentary.length > 0
        ? `The post states that ${clip(premises.join(" "))} The other lines are opinion.`
        : `The post states that ${clip(premises.join(" "))}`;
    const routes: QualityRoute[] = figure ? ["CHECK", "ANALYSIS", "ORIGINAL_INSIGHT"] : ["CHECK", "ANALYSIS", "OPINION"];
    return {
      matched: true,
      summary,
      primaryKind: attributed || commentary.length === 0 ? "factual_assertion" : "opinion",
      routes,
      researchNeed: "yes",
      reason: "A checkable factual premise is in the stored text. Research is required even when the surrounding lines are opinion.",
      checkableFacts: premises.map((sentence) => clip(sentence)),
      lowValue: false,
      draftingCandidate: false,
      review: null,
    };
  }
  if (/\b(i think|i feel|in my view|personally)\b/i.test(text) && premises.length === 0 && predictions.length === 0 && events.length === 0) {
    return {
      matched: true,
      summary: `The post is a judgment: ${clip(text)}`,
      primaryKind: "opinion",
      routes: ["OPINION", "REACTION"],
      researchNeed: "no",
      reason: "The sentence is a subjective judgment. It is not scored true or false.",
      checkableFacts: [],
      lowValue: false,
      draftingCandidate: true,
      review: null,
    };
  }
  if (rhetoric.length > 0 && predictions.length === 0 && events.length === 0 && premises.length === 0) {
    return {
      matched: true,
      summary: `The post is rhetoric. ${clip(rhetoric.join(" "))}`,
      primaryKind: "rhetoric",
      routes: ["REACTION"],
      researchNeed: "no",
      reason: "The wording is understandable and has no proposition to research or draft.",
      checkableFacts: [],
      lowValue: true,
      draftingCandidate: false,
      review: null,
    };
  }
  return blank("");
}

export function replaceUserLabel(summary: string) {
  return summary.replace(/\b[Tt]he user\b/g, (match) => (match[0] === "T" ? "The post" : "the post"));
}
