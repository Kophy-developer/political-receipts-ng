import type { SourceQuality } from "@/lib/editorial/quality";
import type { SeriesAnalysis } from "@/lib/research/series";
import { formatInvestment, formatPercentPoint } from "@/lib/editorial/money";

export type EditorialPost = { style: "conversational" | "punchy" | "analytical"; text: string };

const technicalDump = /retrieved_at|live world bank retrieval|cached official|not a live retrieval|parser|provenance:|data\.worldbank\.org|nigerianstat\.gov\.ng|this is not a verdict|source ingestion|\d{10,}/i;
const causal = /because of tinubu|proves that|caused by|the (president|administration) caused|companies (left|leaving|packed)/i;
const inventedOpinion = /\bi (think|believe|feel) the economy\b|\bour investigation found\b|\bfact-check:/i;

function rejectsClaim(quality: SourceQuality) {
  return /rejects another person's claim|does not assert/i.test(quality.summary);
}

function money(analysis: SeriesAnalysis, value: number) {
  return formatInvestment(value, analysis.unit);
}

function percentText(value: number | null) {
  return formatPercentPoint(value)?.body ?? null;
}

export function seriesInsight(analysis: SeriesAnalysis) {
  const ten = analysis.tenYear;
  const recent = analysis.threeYear;
  if (ten?.percent !== null && ten?.percent !== undefined && recent?.percent !== null && recent?.percent !== undefined) {
    if (Math.abs(recent.percent - ten.percent) >= 15) {
      return `${ten.fromYear} to ${ten.toYear} and ${recent.fromYear} to ${recent.toYear} are different windows, not two readings of the same change.`;
    }
  }
  if (ten) return `${analysis.series} from ${ten.fromYear} to ${ten.toYear} is the comparison the opened years can support.`;
  const first = analysis.observations[0];
  const last = analysis.observations.at(-1);
  return first && last ? `${analysis.series} in the opened table runs from ${first.year} to ${last.year}.` : analysis.series;
}

function seriesPhrase(analysis: SeriesAnalysis) {
  if (/foreign direct investment/i.test(analysis.series)) return "foreign direct investment, net inflows";
  return analysis.series.toLowerCase();
}

function attribution(quality: SourceQuality) {
  if (!rejectsClaim(quality)) return "";
  return "Someone told him foreign companies are investing and that the economy has never been better. He rejected that. He did not say foreign companies are not investing.";
}

export function composeEditorialPosts(input: { quality: SourceQuality; analysis: SeriesAnalysis }): EditorialPost[] {
  const { analysis } = input;
  const name = seriesPhrase(analysis);
  const ten = analysis.tenYear;
  const recent = analysis.threeYear;
  const latest = analysis.changes.at(-1);
  const negative = analysis.observations.find((item) => item.value < 0);
  const who = attribution(input.quality);
  const tenPercent = ten ? percentText(ten.percent) : null;
  const recentPercent = recent ? percentText(recent.percent) : null;
  const windows = Boolean(ten && recent && tenPercent && recentPercent && Math.abs((recent.percent ?? 0) - (ten.percent ?? 0)) >= 15);
  const start = ten ? money(analysis, ten.start) : null;
  const end = ten ? money(analysis, ten.end) : null;
  const fdi = /foreign direct investment/i.test(analysis.series);

  if (windows && ten && recent && start && end && tenPercent && recentPercent) {
    const conversational = [
      who,
      `From ${ten.fromYear} to ${ten.toYear}, ${name} went from ${start} to ${end}, about ${tenPercent}%. Narrow it to ${recent.fromYear}–${recent.toYear} and the same series is about ${recentPercent}%.`,
      "A decade and a short recent run can both be true. The table does not say why, and it is not the whole economy.",
    ].filter(Boolean).join(" ");
    const punchy = `About ${tenPercent}% from ${ten.fromYear} to ${ten.toYear}. About ${recentPercent}% from ${recent.fromYear} to ${recent.toYear}. ${fdi ? "Same foreign direct investment series." : `Same ${name} series.`} One window is the long run. The other is only the latest years.`;
    const outflow = negative ? ` ${negative.year} was a net outflow, not a tally of firms that shut.` : "";
    const analytical = `${name.charAt(0).toUpperCase()}${name.slice(1)} stood at ${start} in ${ten.fromYear} and ${end} in ${ten.toYear}, about ${tenPercent}% across that span. From ${recent.fromYear} to ${recent.toYear} it is about ${recentPercent}%.${outflow} A recent jump inside a flatter stretch is not the name of a cause, and it is not a report on the whole economy.`;
    return [
      { style: "conversational", text: conversational },
      { style: "punchy", text: punchy },
      { style: "analytical", text: analytical },
    ];
  }

  const first = analysis.observations[0];
  const last = analysis.observations.at(-1);
  const span = first && last ? `From ${first.year} to ${last.year}, ${name} moved from ${money(analysis, first.value)} to ${money(analysis, last.value)}.` : "";
  const recentLine = recent && recentPercent ? ` The ${recent.fromYear} to ${recent.toYear} change is about ${recentPercent}%.` : "";
  const yearLine = latest && latest.percent !== null ? ` The latest year, ${latest.fromYear} to ${latest.toYear}, is about ${percentText(latest.percent)}%.` : "";
  const conversational = [who, `${span}${recentLine || yearLine}`, "The table does not say why."].filter(Boolean).join(" ");
  const punchy = [span, "That is the opened series, not an explanation."].filter(Boolean).join(" ");
  const analytical = [who, span, recentLine, "A shorter table cannot be stretched into a cause."].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return [
    { style: "conversational", text: conversational },
    { style: "punchy", text: punchy },
    { style: "analytical", text: analytical },
  ];
}

export function composeFromAnalysis(input: { quality: SourceQuality; analysis: SeriesAnalysis; domain?: string }) {
  return composeEditorialPosts(input)[0]?.text ?? "";
}

function figuresIn(text: string) {
  const money = text.match(/−?\$\d+\.\d{2}bn/g) ?? [];
  const percents = text.match(/about \d+(?:\.\d)?%/gi) ?? [];
  return money.length + percents.length;
}

export function validateEditorialPosts(analysis: SeriesAnalysis, quality: SourceQuality, drafts: Array<{ style?: string; text: string }>) {
  if (!drafts.length) return { ok: false as const, reason: "No draft was written from the opened series." };
  const allowedMoney = new Set(analysis.observations.map((item) => formatInvestment(item.value, analysis.unit)));
  const allowedPercents = new Set(
    [analysis.tenYear?.percent, analysis.threeYear?.percent, ...analysis.changes.map((item) => item.percent)]
      .map((item) => formatPercentPoint(item ?? null)?.body)
      .filter((item): item is string => Boolean(item)),
  );
  const texts = drafts.map((draft) => draft.text.trim());
  if (new Set(texts).size !== texts.length) return { ok: false as const, reason: "The draft options repeat one another." };
  for (const text of texts) {
    if (!text) return { ok: false as const, reason: "A draft option is empty." };
    if (text.length > 900) return { ok: false as const, reason: "A draft is still a research note, not a post." };
    if (technicalDump.test(text)) return { ok: false as const, reason: "A draft still contains research metadata." };
    if (causal.test(text)) return { ok: false as const, reason: "A draft treats the series as a cause." };
    if (inventedOpinion.test(text)) return { ok: false as const, reason: "A draft adds an opinion the research did not support." };
    if (/^\s*(unverified|this is unverified)\b/i.test(text) && drafts.length === 1 && text.length < 80) {
      return { ok: false as const, reason: "A disclaimer is not a draft." };
    }
    const usedMoney = text.match(/−?\$\d+\.\d{2}bn/g) ?? [];
    if (usedMoney.some((item) => !allowedMoney.has(item))) return { ok: false as const, reason: "A draft uses a figure that is not in the saved observations." };
    const usedPercents = [...text.matchAll(/about (\d+(?:\.\d)?)%/gi)].map((match) => match[1]);
    if (usedPercents.some((item) => !allowedPercents.has(item))) return { ok: false as const, reason: "A draft uses a percentage the saved series does not support." };
    const years = [...text.matchAll(/\b20\d\d\b/g)].map((match) => Number(match[0]));
    const known = new Set(analysis.observations.map((item) => item.year));
    if (years.some((year) => !known.has(year))) return { ok: false as const, reason: "A draft mentions a year that is not in the saved series." };
    if (figuresIn(text) > 4) return { ok: false as const, reason: "A draft lists more figures than a post needs." };
    if (rejectsClaim(quality) && /foreign companies are not investing/.test(text) === false && drafts.length === 1) {
      return { ok: false as const, reason: "The draft attributes the rejected claim to the author." };
    }
  }
  if (rejectsClaim(quality) && !texts.some((text) => /did not say foreign companies are not investing/i.test(text))) {
    return { ok: false as const, reason: "The draft attributes the rejected claim to the author." };
  }
  if (analysis.tenYear?.percent !== null && analysis.threeYear?.percent !== null && analysis.tenYear && analysis.threeYear) {
    const long = formatPercentPoint(analysis.tenYear.percent)?.body;
    const short = formatPercentPoint(analysis.threeYear.percent)?.body;
    if (long && short && Math.abs(analysis.threeYear.percent - analysis.tenYear.percent) >= 15) {
      if (!texts.some((text) => text.includes(long) && text.includes(short))) {
        return { ok: false as const, reason: "The draft misses the difference between the long and recent windows." };
      }
    }
  }
  return { ok: true as const, reason: "The opened series is filed with the story. The posts are not a verdict." };
}
