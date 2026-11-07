import { extractDocument, type Observation } from "@/lib/research/extract";
import type { Investigation } from "@/lib/research/investigate";
import { analyzeSeries, type SeriesAnalysis } from "@/lib/research/series";

type ReadableSource = {
  title: string;
  url: string;
  domain: string;
  snippet?: string | null;
  opened?: boolean;
  text?: string | null;
  premise?: string;
  stance?: "supports" | "contradicts" | "contextualizes" | "does_not_address";
  limitation?: string;
};

export const researchStages = [
  "SEARCH_COMPLETED",
  "SOURCES_RETRIEVED",
  "EVIDENCE_EXAMINED",
  "EVIDENCE_INSUFFICIENT",
  "EVIDENCE_READY",
] as const;

export type ResearchStage = (typeof researchStages)[number];

export type ExaminedResearch = {
  sources: ReadableSource[];
  observations: Observation[];
  analysis: SeriesAnalysis | null;
  stage: ResearchStage;
  stagesReached: ResearchStage[];
};

type Selectable = {
  id: string;
  url: string;
  title: string;
  domain: string;
  snippet?: string | null;
  retrievalStatus?: string;
  inDomain?: boolean;
};

function hostOf(domain: string) {
  return domain.toLowerCase().replace(/^www\./, "");
}

export function chooseDocumentIds(results: Selectable[], investigation: Investigation, limit: number) {
  const eligible = results.filter((item) => item.url.startsWith("https://") && item.retrievalStatus !== "rejected" && item.inDomain !== false);
  const ranked = eligible.slice().sort((left, right) => score(right, investigation) - score(left, investigation));
  const statistical = ranked.filter((item) => investigation.preferredHosts.some((host) => hostOf(item.domain).endsWith(host)));
  if (investigation.numerical) return statistical.slice(0, Math.max(0, limit)).map((item) => item.id);
  const pool = ranked.filter((item) => !investigation.rejectedSubstitutes.some((host) => hostOf(item.domain).endsWith(host)));
  const chosen = (pool.length ? pool : ranked).slice(0, Math.max(0, limit));
  return chosen.map((item) => item.id);
}

function score(item: Selectable, investigation: Investigation) {
  const host = hostOf(item.domain);
  let value = 0;
  if (investigation.preferredHosts.some((preferred) => host.endsWith(preferred))) value += 5;
  if (investigation.rejectedSubstitutes.some((blocked) => host.endsWith(blocked))) value -= 4;
  const blob = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
  if (/capital importation|foreign direct investment|unctad|national bureau of statistics/.test(blob)) value += 3;
  if (/\.csv\b|statistical|table/.test(blob)) value += 1;
  return value;
}

function seriesAddresses(investigation: Investigation, observations: Observation[]) {
  if (!observations.length) return false;
  if (!investigation.numerical) return observations.length >= 3;
  return observations.some((item) => /capital importation|foreign direct investment|portfolio investment/i.test(item.series));
}

export function examineSources(investigation: Investigation, sources: ReadableSource[]): ExaminedResearch {
  const readings: ReadableSource[] = [];
  const observations: Observation[] = [];
  let opened = 0;
  let unreadable = 0;
  for (const source of sources) {
    const openedPage = source.opened === true;
    if (!openedPage) {
      readings.push({
        ...source,
        opened: false,
        stance: "does_not_address",
        limitation: investigation.numerical
          ? "The result was not opened. A title or snippet is not a statistical series and does not establish an investment trend."
          : "The page was not opened, so it cannot establish the factual conclusion.",
      });
      continue;
    }
    opened += 1;
    const extracted = extractDocument({ html: source.text?.includes("<table") ? source.text : undefined, text: source.text || "", url: source.url, title: source.title });
    if (!extracted.readable) {
      unreadable += 1;
      readings.push({
        ...source,
        stance: "does_not_address",
        limitation: extracted.limitation || "The document could not be read. Its contents were not invented.",
      });
      continue;
    }
    const relevant = seriesAddresses(investigation, extracted.observations);
    const substitute = investigation.rejectedSubstitutes.some((host) => hostOf(source.domain).endsWith(host));
    const discussesPremise = /invest|econom|importation|capital/i.test(`${source.title}\n${source.text ?? ""}\n${source.snippet ?? ""}`);
    if (investigation.numerical && substitute && !relevant) {
      readings.push({
        ...source,
        stance: "does_not_address",
        limitation: "A State House page was opened. It is not used as a substitute for a statistical dataset.",
      });
      continue;
    }
    if (investigation.numerical && !relevant && !discussesPremise) {
      readings.push({
        ...source,
        stance: "does_not_address",
        limitation: "The opened page does not contain a relevant numerical series.",
      });
      continue;
    }
    if (investigation.numerical && relevant) observations.push(...extracted.observations.map((item) => ({ ...item, url: item.url || source.url })));
    readings.push({
      ...source,
      stance: "contextualizes",
      limitation: relevant
        ? "An opened document contains a parsed series. The series is evidence of those figures, not a verdict about why they changed."
        : "An opened page discusses the premise. It is not a statistical series and it is not a verdict.",
    });
  }
  const analysis = investigation.numerical && observations.length ? analyzeSeries(observations, investigation.focusSeries) : null;
  const openedContext = readings.some((source) => source.opened && source.stance && source.stance !== "does_not_address");
  const ready = Boolean(analysis?.chart && analysis.comparable) || (openedContext && !analysis?.chart);
  const examined = opened > unreadable;
  const stage: ResearchStage = ready
    ? "EVIDENCE_READY"
    : examined
      ? "EVIDENCE_INSUFFICIENT"
      : opened
        ? "SOURCES_RETRIEVED"
        : "SEARCH_COMPLETED";
  const stagesReached: ResearchStage[] = ["SEARCH_COMPLETED"];
  if (opened) stagesReached.push("SOURCES_RETRIEVED");
  if (examined) stagesReached.push("EVIDENCE_EXAMINED");
  if (stage === "EVIDENCE_INSUFFICIENT" || stage === "EVIDENCE_READY") stagesReached.push(stage);
  return { sources: readings, observations, analysis: ready ? analysis : analysis, stage, stagesReached };
}
