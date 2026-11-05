import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";
import {
  plannedNextStage,
  type Assessment,
  type Priority,
  type RankedConversation,
  type Timeliness,
} from "@/lib/editorial/model";

export type ConversationDraft = {
  id: string;
  text: string;
  discoveredAt?: string;
};

const forecastCue = /\b(will win|will lose|will sweep|will turn|going to win|cannot survive|already decided|tsunami|before the next election)\b/i;
const forecastFrame = /\b(2027|election|sweep|tsunami|survive)\b/i;
const attribution = /\b(said|says|claimed|alleges|alleged|according to|announced|is said to|are said to)\b/i;
const act = /\b(paid|spent|attracted|bought|created|drove|driven)\b/i;
const figure = /(?:₦|\$|£)\s?\d|\b\d[\d,.]*(?:\s*(?:billion|million|thousand))\b/i;
const concrete = /\b(taxi|university|billboards?|ringtone|fees|investment|budget|register|polling)\b/i;
const frame = /\b(proof that|used as proof|different claim|rather than the number)\b/i;
const visitCue = /\b(visited|visits|met with|hosted)\b/i;
const visitContext = /\b(with|sultan|president|governor|minister|leaders|palace|delegation)\b/i;
const implication = /\b(signal|coalition|means|implies|being read|reading of)\b/i;
const praiseCue = /\b(best|greatest|never had|nobody else|simply the greatest)\b/i;
const praiseAngle = /\b(because|except|unless|the problem|the limit|the catch)\b/i;
const hardshipCue = /\b(skip(?:ping)? meals|food prices|cost of eating|hunger|hardship|transport fare|fuel price)\b/i;
const insultCue = /\b(fool(?:ish)?|idiot|stupid|useless|moron|bastard)\b/i;
const rhetoricCue = /\b(hate|wicked|disgrace|useless|criminal)\b/i;
const greeting = /\b(happy new month|happy new week|good morning)\b/i;
const humourCue = /\b(lol|lmao|joke)\b|😂/i;
const questionCue = /\?/;
const timely = /\b(today|yesterday|this quarter|this week|just|2027)\b/i;
const currentAffairs = /\b(election|government|visit|prices|investment)\b/i;

function clip(value: string, max = 140) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function wordsOf(text: string) {
  return text.split(/\s+/).filter(Boolean);
}

export function isForecast(text: string) {
  return forecastCue.test(text) || (/\bwill\b/i.test(text) && forecastFrame.test(text));
}

export function hasCheckableFact(text: string) {
  return (attribution.test(text) || act.test(text)) && (figure.test(text) || concrete.test(text));
}

function isEvent(text: string) {
  return visitCue.test(text) && visitContext.test(text);
}

function timelinessFor(text: string): Timeliness {
  if (timely.test(text)) return "high";
  if (currentAffairs.test(text) || isEvent(text)) return "medium";
  return "low";
}

function priorityFor(score: number): Priority {
  if (score >= 58) return "high";
  if (score >= 34) return "medium";
  return "low";
}

function voiceFor(type: OpportunityType | null, forecast: boolean): Assessment["voice"] {
  if (forecast) return "prediction";
  if (type === "check") return "fact";
  if (type === "analysis" || type === "original_insight") return "analysis";
  if (type === "humour") return "humour";
  return "opinion";
}

function base(text: string, score: number, patch: Partial<Assessment> & Pick<Assessment, "worthTalkingAbout" | "reason">): Assessment {
  const type = patch.opportunityType ?? null;
  const forecast = isForecast(text);
  return {
    worthTalkingAbout: patch.worthTalkingAbout,
    opportunityType: type,
    priority: patch.worthTalkingAbout ? (patch.priority ?? priorityFor(score)) : null,
    researchNeed: patch.researchNeed ?? null,
    timeliness: patch.timeliness ?? timelinessFor(text),
    possibleAngle: patch.possibleAngle ?? "",
    reason: patch.reason,
    passReason: patch.passReason ?? null,
    claimExtractionNeeded: patch.claimExtractionNeeded ?? false,
    claimRequired: false,
    factualVerdict: null,
    contentScore: score,
    voice: patch.voice ?? voiceFor(type, forecast),
  };
}

function contentScore(text: string, type: OpportunityType | null, research: ResearchNeed | null) {
  let score = 0;
  if (hasCheckableFact(text)) score += 28;
  if (figure.test(text)) score += 14;
  if (attribution.test(text)) score += 8;
  if (type === "check" || type === "analysis" || type === "original_insight") score += 12;
  if (type === "question") score += 6;
  if (type === "reaction" || type === "opinion" || type === "humour") score += 4;
  if (research === "yes") score += 8;
  if (research === "recommended") score += 5;
  if (isEvent(text)) score += 6;
  if (frame.test(text)) score += 8;
  if (isForecast(text)) score += 3;
  if (timely.test(text)) score += 8;
  const concretes = text.match(/\b(taxi|university|billboards?|ringtone|investment|meals|visit|crowd|election)\b/gi);
  score += Math.min(12, (concretes?.length ?? 0) * 4);
  if (type === "check") score += 6;
  return score;
}

function passed(text: string, passReason: string, type: OpportunityType | null = null): Assessment {
  return base(text, 0, {
    worthTalkingAbout: false,
    opportunityType: type,
    researchNeed: "no",
    possibleAngle: "",
    reason: passReason,
    passReason,
    claimExtractionNeeded: false,
  });
}

function kept(
  text: string,
  type: OpportunityType,
  research: ResearchNeed,
  reason: string,
  possibleAngle: string,
  claimExtractionNeeded: boolean,
): Assessment {
  const score = contentScore(text, type, research);
  return base(text, score, {
    worthTalkingAbout: true,
    opportunityType: type,
    researchNeed: research,
    possibleAngle,
    reason,
    claimExtractionNeeded,
    priority: priorityFor(score),
  });
}

export function assessConversation(text: string): Assessment {
  const plain = text.replace(/\s+/g, " ").trim();
  const words = wordsOf(plain);
  if (!plain) return passed(plain, "Too little context.");
  if (greeting.test(plain) && !hasCheckableFact(plain)) return passed(plain, "Greeting or spam. Nothing to add.");
  if (insultCue.test(plain) && !hasCheckableFact(plain) && !isEvent(plain) && !isForecast(plain) && !hardshipCue.test(plain)) {
    return passed(plain, "Pure insult. No proposition to add to.");
  }
  if (hasCheckableFact(plain)) {
    const interpretive = frame.test(plain);
    const type: OpportunityType = interpretive ? "original_insight" : "check";
    return kept(
      plain,
      type,
      "yes",
      interpretive
        ? "A figure is being asked to prove more than it says. The number and the conclusion can be separated."
        : "A specific sentence could be confirmed or contradicted from a record.",
      interpretive
        ? "Separate the figure from the conclusion being drawn from it. Do not forecast an election from it."
        : "Check the attributed sentence against a record. Leave the surrounding heat out of the finding.",
      true,
    );
  }
  if (isForecast(plain)) {
    const type: OpportunityType = /\bbecause\b/i.test(plain) && !forecastCue.test(plain) ? "analysis" : "question";
    return kept(
      plain,
      type,
      "no",
      "This is a prediction or a speculation. It can open a question. It is not a result the desk can stamp.",
      "Ask what would have to be true. Do not forecast the result.",
      false,
    );
  }
  if (isEvent(plain)) {
    const type: OpportunityType = implication.test(plain) ? "analysis" : "reaction";
    return kept(
      plain,
      type,
      "recommended",
      "A public visit or meeting is the subject. Context would improve the post. The meeting itself is not a verdict.",
      type === "analysis"
        ? "Describe the visit and the reading people are giving it. Do not invent a motive."
        : "React to the visit that is being reported. Context is useful. A motive is not required.",
      false,
    );
  }
  if (praiseCue.test(plain) && !praiseAngle.test(plain)) {
    return passed(plain, "Subjective praise with no usable angle.", "opinion");
  }
  if (hardshipCue.test(plain)) {
    return kept(
      plain,
      "reaction",
      "no",
      "A concrete condition is named. The post can describe that condition without becoming a verdict.",
      "Describe the condition people are pointing at. Do not turn the complaint into an election forecast.",
      false,
    );
  }
  if (humourCue.test(plain) && words.length >= 8) {
    return kept(plain, "humour", "no", "There is a joke with a political point.", "Keep the joke. Do not promote it to a finding.", false);
  }
  if (questionCue.test(plain) && words.length >= 8) {
    return kept(plain, "question", "no", "The post asks something a reader could take up.", "Ask a narrower question. Do not convert it into a verdict.", false);
  }
  if (praiseCue.test(plain)) {
    return kept(plain, "opinion", "no", "A subjective view has a limit worth naming.", "Say it is a view, and say the limit. Do not treat the praise as a fact.", false);
  }
  if ((rhetoricCue.test(plain) || words.length < 8) && !hasCheckableFact(plain)) {
    return passed(plain, words.length < 8 ? "Too little context." : "Meaningless rhetoric with no usable angle.");
  }
  if (words.length >= 12) {
    return kept(plain, "opinion", "no", "A view is specific enough to answer, if you have one.", "Say it is an opinion. Do not attach a factual verdict.", false);
  }
  return passed(plain, "Too little context.");
}

function titleFrom(text: string) {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return clip(sentence, 110);
}

function normalized(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function assessAndRank(conversations: ConversationDraft[], discoveredAt = new Date().toISOString()): RankedConversation[] {
  const seen = new Set<string>();
  const assessed = conversations.map((conversation) => {
    const key = normalized(conversation.text);
    const duplicate = key.length > 0 && seen.has(key);
    if (key) seen.add(key);
    const assessment = duplicate
      ? {
          ...assessConversation(conversation.text),
          worthTalkingAbout: false,
          passReason: "Duplicate conversation.",
          reason: "Duplicate conversation.",
          priority: null,
          contentScore: 0,
          claimExtractionNeeded: false,
          researchNeed: "no" as const,
        }
      : assessConversation(conversation.text);
    return { conversation, assessment, duplicate };
  });
  const worthwhile = assessed.filter((item) => item.assessment.worthTalkingAbout);
  const ordered = worthwhile
    .map((item, index) => ({ item, index }))
    .sort((left, right) => right.item.assessment.contentScore - left.item.assessment.contentScore || left.index - right.index);
  const rankOf = new Map(ordered.map((entry, index) => [entry.item.conversation.id, index + 1]));
  return assessed.map(({ conversation, assessment }) => {
    const rank = assessment.worthTalkingAbout ? (rankOf.get(conversation.id) ?? null) : null;
    const lifecycle = assessment.worthTalkingAbout ? "RANKED" as const : "PASSED" as const;
    return {
      ...assessment,
      id: conversation.id,
      text: conversation.text,
      title: titleFrom(conversation.text),
      rank,
      lifecycle,
      nextStage: plannedNextStage({ ...assessment, lifecycle }),
      discoveredAt: conversation.discoveredAt ?? discoveredAt,
    };
  });
}
