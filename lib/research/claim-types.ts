import type { ClaimType, Pillar, ResearchQuestion, StatementKind } from "@/lib/research/types";

const rules: Array<{ type: ClaimType; pattern: RegExp; question: string; primary: string }> = [
  { type: "quotation", pattern: /[“"][^”"]{12,}[”"]|\b(said|quoted|according to)\b/i, question: "Did this person or office actually publish these words?", primary: "The speaker’s official record" },
  { type: "economic statistic", pattern: /\b(inflation|cpi|consumer price|gdp|unemployment|naira|exchange rate)\b/i, question: "What figure did the publishing office release, and for which period?", primary: "National Bureau of Statistics or Central Bank of Nigeria" },
  { type: "government spending", pattern: /\b(spent|spending|allocation|appropriat)\b/i, question: "What sum does the budget or the audit record?", primary: "Budget Office or Auditor-General" },
  { type: "budget/public finance", pattern: /\b(budget|debt|deficit|revenue)\b/i, question: "Which official table states this budget or debt figure?", primary: "Budget Office or Debt Management Office" },
  { type: "election rule/process", pattern: /\b(pvc|voter register|polling unit|electoral act|inec)\b/i, question: "What does the electoral rule or INEC notice actually say?", primary: "INEC" },
  { type: "election result", pattern: /\b(election result|votes cast|declared winner|collation)\b/i, question: "What result did the electoral commission declare?", primary: "INEC" },
  { type: "legislative/voting record", pattern: /\b(bill|senate|house of representatives|voted)\b/i, question: "What does the legislative record show?", primary: "National Assembly" },
  { type: "government policy", pattern: /\b(policy|executive order|guideline)\b/i, question: "What did the responsible office publish?", primary: "The ministry or agency named in the claim" },
  { type: "political appointment", pattern: /\b(appointed|minister|nomination)\b/i, question: "Was this appointment announced by the office that makes it?", primary: "The appointing office" },
  { type: "court/legal claim", pattern: /\b(court|judgement|judgment|lawsuit|tribunal)\b/i, question: "What does the judgment or the court record say?", primary: "The court that heard it" },
  { type: "security statistic", pattern: /\b(killed|kidnapped|casualty|insecurity)\b/i, question: "Which office or dataset publishes this security count?", primary: "The agency that owns the count" },
  { type: "public-office record", pattern: /\b(publishes|agency|commission|bureau|office of)\b/i, question: "Is this the office’s stated job, on its own record?", primary: "That office’s own site" },
  { type: "historical claim", pattern: /\b(in 19\d{2}|in 20\d{2}|historically|years ago|first republic|second republic)\b/i, question: "Which contemporary record or official history supports this?", primary: "The archive or office that holds the record" },
  { type: "match fact", pattern: /\b(goal|score|fixture|lineup|transfer|premier league|manchester united)\b/i, question: "What do the club and the competition record say?", primary: "Manchester United or the competition" },
  { type: "market fact", pattern: /\b(interest rate|monetary policy|bond|equity|financial statement)\b/i, question: "Which release or filing states this?", primary: "The central bank, the exchange, or the filing office" },
];

export function inferStatementKind(pillar: Pillar, text: string): StatementKind {
  if (/\b(i think|i reckon|in my view|should have|bottled|class)\b/i.test(text) && pillar === "football") return "opinion";
  if (/\b(i expect|my view|i think the market)\b/i.test(text) && pillar === "finance") return "opinion";
  if (/\b(compared with|the difference|implies|if we divide)\b/i.test(text)) return "analysis";
  if (pillar === "football" && !/\b(score|goal|fee|signed|fixture|table)\b/i.test(text)) return "opinion";
  return "fact";
}

export function inferClaimTypes(text: string, pillar: Pillar): ClaimType[] {
  const found = rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.type);
  if (pillar === "football" && inferStatementKind(pillar, text) === "opinion" && !found.includes("football opinion")) found.push("football opinion");
  if (pillar === "finance" && inferStatementKind(pillar, text) === "analysis") found.push("financial analysis");
  if (found.length === 0) found.push(pillar === "football" ? "football opinion" : "other verifiable factual claim");
  return [...new Set(found)].slice(0, 4);
}

export function questionsFor(types: ClaimType[], pillar: Pillar): ResearchQuestion[] {
  const matched = rules.filter((rule) => types.includes(rule.type));
  const questions = matched.map((rule) => ({ question: rule.question, primary: rule.primary }));
  if (pillar === "football") {
    questions.unshift({ question: "Is this a club fact or a supporter’s opinion?", primary: "Manchester United or the competition, for a fact" });
  }
  if (pillar === "finance") {
    questions.push({ question: "Is this a published figure, a calculation, or an investment opinion?", primary: "The office that publishes the figure" });
  }
  questions.push({ question: "Who is being quoted, and did they publish it?", primary: "The speaker’s own record" });
  const seen = new Set<string>();
  return questions.filter((item) => {
    if (seen.has(item.question)) return false;
    seen.add(item.question);
    return true;
  }).slice(0, 4);
}
