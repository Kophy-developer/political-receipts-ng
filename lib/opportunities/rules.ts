import type { OpportunityAngle, OpportunityProposal, OpportunityScore } from "@/lib/opportunities/types";
import { plainPost } from "@/lib/intel/text";

export type OpportunityPost = { text: string; username?: string | null };

const namedOffice = /\b(inec|national assembly|central bank|nbs|budget office|debt management|director of|minister for)\b/i;
const specificAct = /\b(voter register|photograph|photos|inserted|ai-generated|budget|billion|million|percent|inflation|exchange rate|conceded|set pieces)\b/i;
const accusation = /\b(accused|accusation|rigged|rigging|\brig\b|stolen|manipulat|flooded|stuffed)\b/i;
const heat = /\b(criminals?|foolish|stupid|idiot|hate|kpai|set nigeria on fire|life and death)\b/i;
const question = /\?|when will|why do|why does|i don['’]t understand why|how come\b/i;
const hypothetical = /\b(if am\b|if i am\b|if i were\b|i['’]ll make|i will make)\b/i;
const greeting = /\b(happy new month|happy new week|remain informed)\b/i;
const numberClaim = /\b\d+(\.\d+)?\s*(%|percent|billion|million)\b|\b(more|fewer|less) than any\b/i;
const humourMark = /\b(lmao|lol|haha)\b|🤣|😂/i;
const prediction = /\b(will be|going to|after 2027)\b/i;

function clip(value: string, max = 280) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function happened(posts: OpportunityPost[]) {
  const line = posts.map((post) => plainPost(post.text)).filter(Boolean).join(" ");
  return clip(line || "A stored post is on file.");
}

export function proposeOpportunities(posts: OpportunityPost[]): { worthSaying: boolean; note: string; proposals: OpportunityProposal[] } {
  const text = posts.map((post) => plainPost(post.text)).join(" ");
  const words = text.split(/\s+/).filter(Boolean);
  if (!text || (words.length < 8 && !question.test(text) && !numberClaim.test(text))) {
    return { worthSaying: false, note: "The stored line is too thin to open. That is a desk-rule reading, not a model verdict.", proposals: [] };
  }
  if (greeting.test(text) && !accusation.test(text) && !numberClaim.test(text) && !specificAct.test(text)) {
    return { worthSaying: false, note: "It is a greeting tied to politics. Being political is not a reason to post. Desk rules only. The model was not asked.", proposals: [] };
  }
  if (prediction.test(text) && heat.test(text) && !accusation.test(text) && !specificAct.test(text) && !question.test(text)) {
    return { worthSaying: false, note: "It is a taunt about the future. Desk rules did not find a claim, a question, or a take worth opening. The model was not asked.", proposals: [] };
  }

  const proposals: OpportunityProposal[] = [];
  const event = happened(posts);
  const specific = specificAct.test(text) || numberClaim.test(text);
  const named = namedOffice.test(text);
  const accused = accusation.test(text);
  const hot = heat.test(text);

  if (accused || (specific && numberClaim.test(text))) {
    const score: OpportunityScore = specific && named && !hot ? "high" : (specific || named) && !hot ? "medium" : "low";
    const questions = specific && named
      ? [
          "What does the responsible office's own page say about this role or this record?",
          "Has that office published anything on the specific act in the post?",
          "Which sentence is an accusation, and which part could a document actually show?",
        ]
      : [
          "What exact factual sentence is being alleged, once the insult is set aside?",
          "Which office, if any, publishes the record that would confirm or contradict it?",
        ];
    proposals.push({
      type: "check",
      research: "yes",
      score,
      scoreReason: score === "high"
        ? "A named office and a specific act are on the page. The score is for checkability, not for who it flatters or hurts."
        : score === "medium"
          ? "An institution is named, but the post does not point at a single document. Worth a look. Heat does not raise the score."
          : "A factual accusation is in the post, and it is vague. Public heat is not a reason to treat it as a strong opening.",
      whatHappened: event,
      whyInteresting: specific
        ? "Someone has pointed at a particular record, not only at a party."
        : "Someone is stating a fact about an election or an institution. The fact can be looked up. The mood around it cannot.",
      whatCouldAdd: "You could separate the accusation from what a record shows. The desk is not choosing a side for you.",
      angles: score === "low" ? [] : anglesForCheck(specific),
      questions,
      voice: "fact",
    });
  }

  if (numberClaim.test(text) && !accused) {
    proposals.push({
      type: "analysis",
      research: "yes",
      score: "medium",
      scoreReason: "The post depends on a comparison or a figure. The value is in the working, not in the outrage.",
      whatHappened: event,
      whyInteresting: "A number is doing the work. It is worth showing the period, the denominator, and what the number does not say.",
      whatCouldAdd: "A short working of the figure, if you actually want to explain it. Not a verdict on the person who posted it.",
      angles: [
        { title: "The working", note: "Put the figure next to the previous period and say what changed.", questions: ["What is the latest official figure?", "What was the previous figure?", "What does the change not mean?"] },
        { title: "The limit of the number", note: "Say what a reader might think the number proves, and what it leaves out.", questions: ["What period does the figure cover?", "What would a reader wrongly infer?"] },
      ],
      questions: ["What is the latest official figure?", "What was the figure in the previous period?", "What does this comparison not say?"],
      voice: "analysis",
    });
  }

  if (hypothetical.test(text) && !accused) {
    proposals.push({
      type: "opinion",
      research: "no",
      score: "low",
      scoreReason: "It is a hypothetical. There is room for a personal view, and no factual claim that needs a citation.",
      whatHappened: event,
      whyInteresting: "Someone is imagining a decision. That is not the same as the decision happening.",
      whatCouldAdd: "Only if you have your own view. The post does not supply one for you, and it should not be dressed up with sources.",
      angles: [],
      questions: [],
      voice: "opinion",
    });
  }

  if (question.test(text) && !greeting.test(text)) {
    proposals.push({
      type: "question",
      research: questionNeedsResearch(text) ? "recommended" : "no",
      score: specific ? "medium" : "low",
      scoreReason: specific
        ? "The question turns on a fact, so a little research would make it sharper. The question itself is the post."
        : "It is a real question, and it is a broad one. Breadth keeps the score low.",
      whatHappened: event,
      whyInteresting: "The writer is asking something instead of only declaring it.",
      whatCouldAdd: "A more precise question, if you want to ask the audience one. Not an answer you do not hold.",
      angles: [],
      questions: [],
      voice: "opinion",
    });
  }

  if (humourMark.test(posts.map((post) => post.text).join(" ")) && proposals.length === 0) {
    proposals.push({
      type: "humour",
      research: "no",
      score: "low",
      scoreReason: "The tone is a joke. No citation is required, and none should be invented.",
      whatHappened: event,
      whyInteresting: "It is a human reaction, not a briefing.",
      whatCouldAdd: "A short joke of your own, if you actually find it funny. Skip it if you do not.",
      angles: [],
      questions: [],
      voice: "humour",
    });
  }

  if (proposals.length === 0) {
    return {
      worthSaying: false,
      note: "Desk rules did not find a check, a real question, or a view worth opening. That is not a model verdict.",
      proposals: [],
    };
  }
  return {
    worthSaying: true,
    note: "Sorted by desk rules from stored posts. The model was not asked, so this is not a model verdict.",
    proposals: proposals.slice(0, 3),
  };
}

function questionNeedsResearch(text: string) {
  return specificAct.test(text) || numberClaim.test(text) || namedOffice.test(text);
}

function anglesForCheck(specific: boolean): OpportunityAngle[] {
  if (specific) {
    return [
      { title: "The record", note: "Look up the office and the act. Stop when those two are answered.", questions: ["What does the office's own page say?", "Has the office spoken about this specific act?"] },
      { title: "Accusation and finding", note: "An accusation can be worth repeating as an accusation. It is not yet a finding.", questions: ["What sentence is the accusation?", "What would have to be on the record before it became a finding?"] },
      { title: "What a reader still needs", note: "Name the one missing document. Do not tour the whole topic.", questions: ["Which single document would change your mind?"] },
    ];
  }
  return [
    { title: "The sentence that can be checked", note: "Pull one factual sentence out of the heat.", questions: ["What is the one sentence a record could confirm or contradict?"] },
    { title: "What is only a mood", note: "The insult, the boycott, the slogan: those are not evidence.", questions: ["Which lines are mood rather than fact?"] },
  ];
}
