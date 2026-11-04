import type { ClaimType, Pillar, ResearchProblem, SearchStage, SourceCategory } from "@/lib/research/types";
import { questionsFor } from "@/lib/research/claim-types";
import { authorityShort } from "@/lib/research/quality";

const orgWords = new Set([
  "national", "bureau", "consumer", "price", "index", "independent", "electoral", "commission",
  "central", "bank", "debt", "management", "office", "budget", "federal", "republic", "nigeria",
  "official", "statistics", "voter", "register", "house", "senate", "state",
]);

export type AuthorityRule = { name: string; domains: string[]; pattern: RegExp };

/** Hints only choose domains that already sit in the configured source hierarchy. */
export const authorityRules: AuthorityRule[] = [
  { name: "Independent National Electoral Commission", domains: ["inecnigeria.org"], pattern: /\b(inec|voter register|electoral act|polling unit|\bpvc\b)\b/i },
  { name: "National Bureau of Statistics", domains: ["nigerianstat.gov.ng"], pattern: /\b(inflation|\bcpi\b|consumer price|national bureau of statistics|\bnbs\b)\b/i },
  { name: "Central Bank of Nigeria", domains: ["cbn.gov.ng"], pattern: /\b(monetary policy|central bank|\bcbn\b|interest rate|\bmpr\b)\b/i },
  { name: "Debt Management Office", domains: ["dmo.gov.ng"], pattern: /\b(debt management office|public debt|\bdmo\b|\bdebt\b)\b/i },
  { name: "Budget Office of the Federation", domains: ["budgetoffice.gov.ng"], pattern: /\b(budget office|appropriation|federal budget|\bbudget\b)\b/i },
];

export function personNames(text: string) {
  const found: string[] = [];
  const push = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 4) return;
    if (parts.every((part) => orgWords.has(part.toLowerCase()))) return;
    if (!found.includes(name.trim())) found.push(name.trim());
  };
  for (const match of text.matchAll(/\b(?:Dr|Prof|Professor|Mr|Mrs|Ms|Alhaji|Chief)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g)) {
    push(match[1] || "");
  }
  if (found.length) return found.slice(0, 2);
  for (const match of text.matchAll(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g)) push(match[1] || "");
  return found.slice(0, 2);
}

export function officeTitle(text: string) {
  const match = text.match(/\b((?:Director|Minister|Chairman|Commissioner)(?:\s+of)?\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+at\b[\s\S]*$/, "").replace(/\s+/g, " ").trim();
}

export function primaryTarget(claim: string, categories: SourceCategory[]) {
  const tier = categories.find((item) => item.rank === 1);
  const allowed = new Set((tier?.domains ?? []).map((domain) => domain.toLowerCase().replace(/^www\./, "")));
  const matched = authorityRules.filter((rule) => rule.pattern.test(claim));
  const domains = [...new Set(matched.flatMap((rule) => rule.domains.map((domain) => domain.toLowerCase()).filter((domain) => allowed.has(domain))))];
  if (domains.length) {
    const names = matched.filter((rule) => rule.domains.some((domain) => domains.includes(domain.toLowerCase()))).map((rule) => rule.name);
    return { authority: names.join("; "), domains };
  }
  return { authority: tier?.name || "Primary record", domains: [...allowed] };
}

export function targetForStage(claim: string, categories: SourceCategory[], stage: SearchStage) {
  if (stage === "context") return { authority: "Broader context", domains: [] as string[] };
  if (stage === "independent") {
    const domains = [...new Set(categories.filter((item) => item.rank === 2 || item.rank === 3).flatMap((item) => item.domains.map((domain) => domain.toLowerCase().replace(/^www\./, ""))))];
    const name = categories.find((item) => item.rank === 2)?.name || "Independent reporting";
    return { authority: name, domains };
  }
  return primaryTarget(claim, categories);
}

export function pollingFigure(claim: string) {
  const match = claim.match(/\b(\d{2,6})\b/);
  if (!match || !/polling\s+units?/i.test(claim)) return null;
  return match[1];
}

function conceptQueries(claim: string) {
  const lower = claim.toLowerCase();
  const queries: string[] = [];
  const register = /voter register|register of voters/.test(lower);
  const photo = /photograph|image|picture/.test(lower);
  const generated = /ai[-\s]?generated|artificial intelligence|\bfake\b/.test(lower);
  if (register && photo && generated) {
    queries.push("voter register artificial intelligence photographs", "voter register fake photographs", "voter register generated images");
  } else if (register) {
    queries.push("voter register");
  }
  if (/consumer price|\bcpi\b|inflation/.test(lower)) queries.push("consumer price index", "inflation rate");
  if (/monetary policy|interest rate|\bmpr\b/.test(lower)) queries.push("monetary policy rate");
  if (/\bdebt\b/.test(lower)) queries.push("public debt");
  if (/\bbudget\b/.test(lower)) queries.push("federal budget");
  return queries;
}

export function researchProblems(claim: string, authority: string, pillar: Pillar, types: ClaimType[] = []) {
  const figure = pollingFigure(claim);
  if (figure) {
    return [
      { problem: "record" as const, question: `Did INEC create or add ${figure} polling units?`, authority },
      { problem: "record" as const, question: `If ${figure} is a real figure, what exactly does that number represent: new polling units, additional polling units, registration centres, wards, voter-registration locations, constituencies, or another INEC administrative count?`, authority },
      { problem: "allegation" as const, question: "Is there authoritative evidence that those polling units were created for AI-generated or fake registered voters?", authority },
      { problem: "allegation" as const, question: "Is there authoritative evidence that AI-generated identities, photographs, or voter records were inserted into the register in connection with these polling units?", authority },
    ];
  }
  const name = personNames(claim)[0];
  const title = officeTitle(claim);
  const accused = /\b(accused|accusation|alleged|allegedly)\b/i.test(claim);
  const questions: Array<{ problem: ResearchProblem; question: string; authority: string }> = [];
  if (name && title) {
    questions.push({
      problem: "record",
      question: `Does an authoritative record establish that ${name} holds the role ${title}?`,
      authority,
    });
  }
  if (accused && /voter register/i.test(claim) && /photograph|image|picture/i.test(claim)) {
    questions.push({
      problem: "allegation",
      question: "Is there authoritative evidence concerning AI-generated or inserted photographs in the voter register?",
      authority,
    });
  } else if (accused) {
    questions.push({
      problem: "allegation",
      question: "Is there authoritative evidence of the act described in the accusation?",
      authority,
    });
  }
  if (accused) {
    questions.push({
      problem: "attribution",
      question: "Who originally made the accusation?",
      authority: "The person who first published the accusation",
    });
  }
  if (questions.length) return questions;
  const fallback = questionsFor(types, pillar)[0];
  return [{
    problem: "general" as const,
    question: fallback?.question || "What does the office that owns this record actually publish?",
    authority,
  }];
}

export function queryVariants(claim: string, authority: string, questions: Array<{ problem: ResearchProblem; question: string }>) {
  const name = personNames(claim)[0];
  const title = officeTitle(claim);
  const short = authorityShort(authority);
  const byProblem = (problem: ResearchProblem) => questions.find((item) => item.problem === problem)?.question || questions[0]?.question || "What does the record say?";
  const variants: Array<{ problem: ResearchProblem; question: string; query: string }> = [];
  const push = (problem: ResearchProblem, query: string, question?: string) => {
    const text = query.replace(/\s+/g, " ").trim();
    if (text.length < 3) return;
    if (variants.some((item) => item.query.toLowerCase() === text.toLowerCase())) return;
    variants.push({ problem, question: question || byProblem(problem), query: text });
  };
  if (name && title) {
    const compact = title.replace(/\bof\b/gi, "").replace(/\s+/g, " ").trim();
    const acronym = title.match(/\b[A-Z]{2,6}\b/);
    push("record", `${name} ${compact}`);
    if (acronym) push("record", `${name} ${acronym[0]} department`);
    push("record", `${name} ${title}`);
    push("record", `${name} ${short} ${compact}`);
  } else if (name) {
    push("record", `${name} ${short}`);
  }
  const figure = pollingFigure(claim);
  if (figure) {
    push("record", `${figure} polling units`, `Did INEC create or add ${figure} polling units?`);
    push("record", `${figure} registration centres wards constituencies`, `If ${figure} is a real figure, what exactly does that number represent?`);
    push("allegation", "artificial intelligence voter register generated photographs", "Is there authoritative evidence that those polling units were created for AI-generated or fake registered voters?");
    push("allegation", "fake voters biometric registration voter photographs", "Is there authoritative evidence that AI-generated identities, photographs, or voter records were inserted into the register in connection with these polling units?");
  }
  const conceptProblem: ResearchProblem = questions.some((item) => item.problem === "allegation") ? "allegation" : "general";
  for (const query of conceptQueries(claim)) push(conceptProblem, query);
  if (name && questions.some((item) => item.problem === "attribution")) push("attribution", `${name} accusation`);
  if (!variants.length) {
    const words = claim
      .replace(/https?:\/\/\S+/g, " ")
      .split(/[^A-Za-z0-9]+/)
      .filter((word) => word.length > 3)
      .slice(0, 8)
      .join(" ");
    push("general", words || claim.slice(0, 120));
  }
  return variants;
}

export function scheduleVariants<T>(variants: T[], cursor: number, max: number, stage: SearchStage) {
  const pool = stage === "context"
    ? variants
    : variants.filter((item) => (item as { problem?: ResearchProblem }).problem !== "attribution");
  if (!pool.length || max < 1) return [] as T[];
  const start = ((cursor % pool.length) + pool.length) % pool.length;
  const chosen: T[] = [];
  for (let index = 0; index < pool.length && chosen.length < max; index += 1) chosen.push(pool[(start + index) % pool.length]);
  return chosen;
}

export function interleaveVariants<T extends { problem: ResearchProblem }>(variants: T[]) {
  const record = variants.filter((item) => item.problem === "record");
  const allegation = variants.filter((item) => item.problem === "allegation");
  const rest = variants.filter((item) => item.problem !== "record" && item.problem !== "allegation");
  const mixed: T[] = [];
  const length = Math.max(record.length, allegation.length);
  for (let index = 0; index < length; index += 1) {
    if (record[index]) mixed.push(record[index]);
    if (allegation[index]) mixed.push(allegation[index]);
  }
  return [...mixed, ...rest];
}
