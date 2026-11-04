import type { OpportunityAngle, OpportunityProposal, OpportunityScore, ResearchNeed } from "@/lib/opportunities/types";
import { separatePost } from "@/lib/intel/classify";
import { plainPost } from "@/lib/intel/text";

export type OpportunityPost = { text: string; username?: string | null };

export type OpportunityReading = {
  worthSaying: boolean;
  note: string;
  proposals: OpportunityProposal[];
  posts: number;
  accounts: number;
};

const greeting = /\b(happy new month|happy new week|remain informed)\b/i;
const question = /\?|when will|why do|why does|how come\b/i;
const hypothetical = /\b(if am\b|if i am\b|if i were\b|i['’]ll make|i will make)\b/i;
const threat = /\b(set nigeria on fire|you criminals)\b/i;
const prediction = /\b(will be|going to|after 2027)\b/i;
const heat = /\b(criminals?|foolish|stupid|idiot|hate|kpai|set nigeria on fire)\b/i;
const concreteCall = /\b(occupy|get ready to)\b/i;
const aiTheme = /\bai\b[^.]{0,48}\b(generat\w*|created|faces|photographs?|photos?)\b/i;
const aiObject = /\b(voters?|faces|photographs?|photos?|people|register|registered|polling)\b/i;

function clip(value: string, max = 360) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

export function independentAccounts(posts: OpportunityPost[]) {
  const names = new Set<string>();
  posts.forEach((post, index) => {
    const name = post.username?.replace(/^@/, "").trim().toLowerCase();
    names.add(name || `missing-name-${index}`);
  });
  return names.size;
}

function quiet(posts: number, accounts: number, note: string): OpportunityReading {
  return { worthSaying: false, note, proposals: [], posts, accounts };
}

function reach(posts: OpportunityPost[], postCount = posts.length, accountCount = independentAccounts(posts)) {
  const postLabel = `${postCount} post${postCount === 1 ? "" : "s"}`;
  const accountLabel = `${accountCount} independent account${accountCount === 1 ? "" : "s"}`;
  return { postCount, accountCount, line: `${postLabel}, ${accountLabel}.` };
}

function card(
  posts: OpportunityPost[],
  input: Omit<OpportunityProposal, "postCount" | "accountCount">,
  postCount?: number,
  accountCount?: number,
): OpportunityProposal {
  const counted = reach(posts, postCount, accountCount);
  return {
    ...input,
    postCount: counted.postCount,
    accountCount: counted.accountCount,
    scoreReason: `${counted.line} ${input.scoreReason}`,
    whatHappened: clip(input.whatHappened),
  };
}

function checkScore(text: string): OpportunityScore {
  const plain = plainPost(text);
  const numbered = /\b\d{2,6}\b(?:\s+\w+){0,6}?\s+polling\s+units?y?\b/i.test(plain);
  const namedOfficial = /\bdirector\b/i.test(plain) && /\b(accused|allowing|overseeing)\b/i.test(plain);
  const concrete = /\b(polling\s+units?y?|photograph|voter\s+regist|ai\b|secret)\b/i.test(plain);
  const announcedAct = /\bannounces?\b/i.test(plain) && /\b(crime|illegal|unlawful)\b/i.test(plain) && /\bvot/i.test(plain);
  if ((numbered || namedOfficial) && concrete) return "high";
  if (announcedAct || (concrete && /\binec\b/i.test(plain))) return "medium";
  return "low";
}

function checkAngles(claims: string[]): OpportunityAngle[] {
  const angles: OpportunityAngle[] = claims.slice(0, 2).map((claim) => ({
    title: claim.replace(/\.$/, ""),
    note: "This is the sentence a record could confirm or contradict. The insult around it is not evidence.",
    questions: ["Which office publishes the record for this sentence?", "What would the record have to say before this became a finding?"],
  }));
  angles.push({
    title: "Rhetoric is not the finding",
    note: "Words such as criminal, rigged, or corrupt can stay in the quotation. They are not a separate opportunity, and they do not raise the score.",
    questions: ["Which words are heat, and which sentence is the act?"],
  });
  return angles.slice(0, 3);
}

function checkResearch(score: OpportunityScore): ResearchNeed {
  return score === "low" ? "recommended" : "yes";
}

export function proposeOpportunities(posts: OpportunityPost[]): OpportunityReading {
  const text = posts.map((post) => plainPost(post.text)).join(" ");
  const counted = reach(posts);
  const words = text.split(/\s+/).filter(Boolean);
  const separated = separatePost(text);
  if (!text || (words.length < 8 && separated.claims.length === 0 && !question.test(text))) {
    return quiet(counted.postCount, counted.accountCount, "The stored line is too thin to open. Desk rules only. The model was not asked.");
  }
  if (greeting.test(text) && separated.claims.length === 0 && !concreteCall.test(text)) {
    return quiet(counted.postCount, counted.accountCount, "It is a greeting tied to politics. Being political is not a reason to post. Desk rules only. The model was not asked.");
  }
  if (threat.test(text) && separated.claims.length === 0) {
    return quiet(counted.postCount, counted.accountCount, "It is a threat. Desk rules found no act to check and no argument worth adding. The model was not asked.");
  }
  if (prediction.test(text) && heat.test(text) && separated.claims.length === 0 && !question.test(text) && !concreteCall.test(text)) {
    return quiet(counted.postCount, counted.accountCount, "It is a taunt about the future. Desk rules did not find an act, a question, or a take worth opening. The model was not asked.");
  }

  if (separated.claims.length > 0) {
    const score = checkScore(text);
    const research = checkResearch(score);
    const lead = separated.claims.join(" ");
    const repeat = counted.postCount > counted.accountCount
      ? ` ${counted.line} Repeated posts from one account are not several voices.`
      : ` ${counted.line}`;
    return {
      worthSaying: true,
      note: "One check. A question mark in the same post is an angle, not a second card. The model was not asked.",
      posts: counted.postCount,
      accounts: counted.accountCount,
      proposals: [
        card(posts, {
          type: "check",
          research,
          score,
          scoreReason: score === "high"
            ? "A specific act is named, so there is something to add beyond repeating the post. The score is for that act, not for the heat around it."
            : score === "medium"
              ? "There is a specific allegation an editor could examine. It is not precise enough, or not well enough sourced in the stored text, to rank as high."
              : "A checkable shape is there, and it is too vague or too thin to be a strong opening.",
          whatHappened: `${lead}${repeat}`,
          whyInteresting: "The useful part is the act, not the adjective. A reader can learn something only if those sentences are kept apart from the rhetoric.",
          whatCouldAdd: "Quote the factual sentence as an allegation. Say what a record would have to show. Leave the insult in the quotation if you need it, and do not promote it to a finding.",
          angles: checkAngles(separated.claims),
          questions: separated.claims.slice(0, 3).map((claim) => `What record would confirm or contradict this: ${claim}`),
          voice: "fact",
        }),
      ],
    };
  }

  if (concreteCall.test(text)) {
    return {
      worthSaying: true,
      note: "A mobilization call can be worth discussing. It is not a check. The model was not asked.",
      posts: counted.postCount,
      accounts: counted.accountCount,
      proposals: [
        card(posts, {
          type: "analysis",
          research: "no",
          score: counted.accountCount >= 3 ? "medium" : "low",
          scoreReason: counted.accountCount >= 3
            ? "Several independent accounts make the same call. The value is in describing that sample, not in treating it as a national mood."
            : "The call is specific enough to describe. One account, even posted more than once, is a thin basis for a larger claim about public sentiment.",
          whatHappened: clip(`${counted.line} The stored text calls on people to act around election administration: ${text}`),
          whyInteresting: "The slogan shows how this account is framing the electoral body. It does not, by itself, show how many people agree.",
          whatCouldAdd: "You could describe the call, and you could say that the post count is not the account count. A sentence about Nigerians in general is not supported by a one-account sample.",
          angles: [
            {
              title: "Posts are not accounts",
              note: `${counted.line} Repeating a slogan does not add a new voice.`,
              questions: ["How many accounts said this in the stored posts?", "How many of the posts are the same account?"],
            },
            {
              title: "What the call asks",
              note: "Say what the slogan tells people to do. That description does not need a web search.",
              questions: ["What action does the post ask for?"],
            },
            {
              title: "A judgment, if you have one",
              note: "Calling the slogan reckless, useful, or empty is an opinion. That opinion does not need a citation, and it should not be dressed up as a finding about public trust.",
              questions: [],
            },
          ],
          questions: [],
          voice: "analysis",
        }),
      ],
    };
  }

  if (hypothetical.test(text)) {
    return {
      worthSaying: true,
      note: "A hypothetical is a view. Desk rules only. The model was not asked.",
      posts: counted.postCount,
      accounts: counted.accountCount,
      proposals: [
        card(posts, {
          type: "opinion",
          research: "no",
          score: "low",
          scoreReason: "Someone is imagining an appointment. There is room for a personal view, and no record that would improve it.",
          whatHappened: clip(text),
          whyInteresting: "It is a wish about who should hold an office, not an event that has happened.",
          whatCouldAdd: "Only if you have your own view of that appointment. Do not invent a source for a hypothetical.",
          angles: [
            {
              title: "Your own view",
              note: "The post supplies a fantasy appointment. Any reply has to be your view.",
              questions: [],
            },
          ],
          questions: [],
          voice: "opinion",
        }),
      ],
    };
  }

  if (question.test(text)) {
    const specific = /\b(inec|voter|polling|budget|director)\b/i.test(text);
    return {
      worthSaying: true,
      note: "The question is the opportunity. Desk rules only. The model was not asked.",
      posts: counted.postCount,
      accounts: counted.accountCount,
      proposals: [
        card(posts, {
          type: "question",
          research: specific ? "recommended" : "no",
          score: specific ? "medium" : "low",
          scoreReason: specific
            ? "The question points at an institution. A little research would make it sharper. The question itself is still the post."
            : "It is a real question, and it is a broad one. Breadth keeps the score low. No citation is required to repeat the question.",
          whatHappened: clip(text),
          whyInteresting: "The writer is asking something instead of only declaring it.",
          whatCouldAdd: "A more precise question, if you want to ask the audience one. Not an answer you do not hold.",
          angles: [
            {
              title: "Ask a narrower question",
              note: "Keep it as a question. Do not convert it into a claim.",
              questions: [],
            },
          ],
          questions: [],
          voice: "opinion",
        }),
      ],
    };
  }

  return quiet(counted.postCount, counted.accountCount, "Desk rules did not find an act, a call, a question, or a view worth opening. That is not a model verdict.");
}

export function aiVoterTheme(text: string) {
  return aiTheme.test(plainPost(text)) && aiObject.test(plainPost(text));
}

export function proposeSampleReading(posts: OpportunityPost[]): OpportunityProposal | null {
  const themed = posts.filter((post) => aiVoterTheme(post.text));
  const accounts = independentAccounts(themed);
  if (accounts < 2) return null;
  const names = [...new Set(themed.map((post) => post.username?.replace(/^@/, "") || "an unnamed account"))];
  const named = names.slice(0, 6).map((name) => `@${name}`).join(", ");
  return card(
    themed,
    {
      type: "analysis",
      research: "recommended",
      score: "medium",
      scoreReason: "Sample across stored posts. The value is keeping these allegations apart. The sample is too small to call the fear widespread, so a broader mood claim would need care.",
      whatHappened: `${themed.length} stored posts from ${accounts} independent accounts mention AI-made voters, faces, or photographs in connection with the register or with polling units. The accounts in this sample include ${named}. They do not make the same claim.`,
      whyInteresting: "These posts are easy to collapse into one story about manipulated voter records. The stored sample supports a smaller point: more than one account is talking about AI and the register, and the sentences differ.",
      whatCouldAdd: "Say what each account actually alleged, and say that this is the posts already on the desk, not a measure of the whole platform. A trust-in-INEC sentence would overread the sample.",
      angles: [
        {
          title: "Keep the allegations apart",
          note: "A unit count, a named official, a secret polling unit, and a warning about method are different sentences.",
          questions: ["Which sentence names a number?", "Which sentence names an official?", "Which sentence names no office at all?"],
        },
        {
          title: "What the sample cannot say",
          note: "Several accounts in a stored batch are not a trend. Research is recommended only if the angle generalizes beyond these posts.",
          questions: ["Are you describing these accounts, or Nigerians in general?"],
        },
        {
          title: "Where a record would help",
          note: "The factual sentences belong on the check cards. This card does not settle them.",
          questions: ["Which check card has the sentence you would actually look up?"],
        },
      ],
      questions: ["Which of these stored sentences are the same allegation, and which only share a theme?"],
      voice: "analysis",
    },
    themed.length,
    accounts,
  );
}
