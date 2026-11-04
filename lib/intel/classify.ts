import { classifyPost, type Relevance, type TermRule } from "@/lib/intel/relevance";
import { plainPost } from "@/lib/intel/text";

export type DeskClass = "actionable" | "discussion" | "noise";

const record =
  /\b(accused|allegation|voter register|announced|director|budget|appropriat|billion|million|deadline|photograph|inserted|statistics|percent)\b/i;
const adminAllegation = /\b(rigged|rigging|flooded|stuffed|manipulat)\b/i;
const insult = /\b(criminals?|foolish|stupid|idiot|hate|kpai)\b/i;
const voteSlogan = /\b(vote out|vote for)\b/i;
const hypothetical = /\b(if am\b|if i am\b|i['’]ll make|i will make|happy new month)\b/i;

export function deskClassFor(text: string, relevance: Relevance): DeskClass {
  if (relevance === "not_political") return "noise";
  const plain = plainPost(text);
  const words = plain.split(/\s+/).filter(Boolean);
  if (record.test(plain) || (adminAllegation.test(plain) && /\binec\b/i.test(plain))) return "actionable";
  if (insult.test(plain) || voteSlogan.test(plain)) return "noise";
  if (hypothetical.test(plain)) return "discussion";
  if (words.length < 12) return "noise";
  return "discussion";
}

export function judgePost(text: string, rules: TermRule[]) {
  const political = classifyPost(text, rules);
  const deskClass = deskClassFor(text, political.relevance);
  const reason =
    deskClass === "actionable"
      ? `${political.reason} It reads as a checkable allegation, record, or announcement.`
      : deskClass === "discussion"
        ? `${political.reason} It is political discussion without a checkable record.`
        : political.relevance === "not_political"
          ? political.reason
          : `${political.reason} It reads as a slogan, insult, or ordinary prediction.`;
  return { ...political, deskClass, reason };
}
