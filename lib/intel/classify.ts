import { classifyPost, type Relevance, type TermRule } from "@/lib/intel/relevance";
import { plainPost } from "@/lib/intel/text";

export type DeskClass = "actionable" | "discussion" | "noise";

const nigeria = /\b(nigeria|nigerian|inec|lagos|abuja|naira)\b/i;
const greeting = /\b(happy new month|happy new week)\b/i;
const threat = /\b(set nigeria on fire|you criminals)\b/i;
const hypothetical = /\b(if am\b|if i am\b|i['’]ll make|i will make)\b/i;
const question = /\?|when will|why do|why does\b/i;
const mobilization = /\b(occupy|get ready to)\b/i;
const aiMade = /\bai\b[^.]{0,48}\b(generat\w*|created|faces|photographs?|photos?)\b/i;
const aiObject = /\b(voters?|faces|photographs?|photos?|people|register|registered)\b/i;
const normative = /\b(you cannot|do not use|should not)\b/i;
const allegation = /\b(accused|secretly|secret|announces?|announced|inserted|insertion|allowing|overseeing)\b/i;

export type SeparatedPost = {
  claims: string[];
  rhetoric: boolean;
};

export function separatePost(text: string): SeparatedPost {
  const plain = plainPost(text);
  const claims: string[] = [];
  const count = plain.match(/\b(\d{2,6})\b(?:\s+\w+){0,6}?\s+polling\s+units?y?\b/i);
  if (count) claims.push(`${count[1]} polling units are said to have been created${/\bsecretly\b/i.test(plain) ? " in secret" : ""}.`);
  if (/\bsecret\s+polling\s+units?y?\b/i.test(plain)) {
    claims.push("A secret polling unit is alleged.");
  }
  if (aiMade.test(plain) && aiObject.test(plain) && !(normative.test(plain) && !allegation.test(plain))) {
    claims.push("AI-generated voters, faces, or photographs are part of what is being alleged.");
  }
  if (/\bvoter\s+regist/i.test(plain) && /\b(photograph|insert|ai\b)/i.test(plain) && allegation.test(plain)) {
    claims.push("The voter register is alleged to contain inserted or AI-generated photographs.");
  }
  if (/\bdirector\b/i.test(plain) && /\b(accused|allowing|overseeing)\b/i.test(plain) && /\b(photograph|voter\s+regist|ai\b)/i.test(plain)) {
    claims.push("A named official is accused of a specific act involving the voter register.");
  }
  if (/\bannounces?\b/i.test(plain) && /\b(crime|illegal|unlawful)\b/i.test(plain) && /\bvotes?\b/i.test(plain)) {
    claims.push("An official announcement is asserted: protecting votes is being treated as a crime.");
  }
  const rhetoric = /\b(criminals?|corrupt|incompetent|frauds?|fraudulent|foolish|stupid|idiot|hate|kpai|rigged|rigging|\brig\b)\b/i.test(plain);
  return { claims: [...new Set(claims)], rhetoric };
}

export function hasAdminSubstance(text: string) {
  const plain = plainPost(text);
  if (separatePost(plain).claims.length > 0) return true;
  return /\b(polling\s+units?y?|voter\s+registers?|voter\s+records?|registration\s+figures?|pvc)\b/i.test(plain);
}

export function deskClassFor(text: string, relevance: Relevance): DeskClass {
  const plain = plainPost(text);
  const separated = separatePost(plain);
  const substance = hasAdminSubstance(plain);
  if (relevance === "not_political" && !substance) return "noise";
  if (!plain) return "noise";
  if (greeting.test(plain) && separated.claims.length === 0) return "noise";
  if (separated.claims.length > 0) return "actionable";
  if (threat.test(plain) && !question.test(plain) && !mobilization.test(plain) && !hypothetical.test(plain)) return "noise";
  const words = plain.split(/\s+/).filter(Boolean);
  if (hypothetical.test(plain) || question.test(plain) || mobilization.test(plain)) return "discussion";
  if (words.length < 12) return "noise";
  return "discussion";
}

export function judgePost(text: string, rules: TermRule[]) {
  const political = classifyPost(text, rules);
  let relevance = political.relevance;
  let reason = political.reason;
  const matchedTerm = political.matchedTerm;
  if (relevance === "not_political" && hasAdminSubstance(text)) {
    relevance = nigeria.test(text) || /\belection\b/i.test(text) ? "political" : "possibly_political";
    reason = "Configured terms missed it. The post still states an election-administration act.";
  }
  const deskClass = deskClassFor(text, relevance);
  const separated = separatePost(text);
  const classReason =
    deskClass === "actionable"
      ? `${reason} Checkable line: ${separated.claims[0]} Rhetoric in the same post is not the classification.`
      : deskClass === "discussion"
        ? `${reason} It is political discussion. No checkable act was separated from the rhetoric.`
        : relevance === "not_political"
          ? reason
          : `${reason} After the rhetoric is set aside, no proposition is left.`;
  return { relevance, matchedTerm, reason: classReason, deskClass };
}
