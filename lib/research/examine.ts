import { extractDocument, type Observation } from "@/lib/research/extract";
import { previousSizeGate } from "@/lib/research/read-document";
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
  rejection?: string | null;
  text?: string | null;
};

function hostOf(domain: string) {
  return domain.toLowerCase().replace(/^www\./, "");
}

function decodedUrl(url: string) {
  try {
    return decodeURIComponent(url).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function unsuitablePage(title: string) {
  return /annual economic report|annual report|reforms|explorer|country profile|regulatory review/.test(title);
}

function mentionsSeries(item: Selectable, investigation: Investigation) {
  const focus = (investigation.focusSeries ?? "").toLowerCase();
  if (!focus) return false;
  const title = item.title.toLowerCase();
  const url = decodedUrl(item.url);
  const snippet = (item.snippet ?? "").toLowerCase();
  if (title.includes(focus) || url.includes(focus)) return true;
  return snippet.includes(focus) && /elibrary\/read|pdfuploads|\.pdf(?:$|\?)/i.test(item.url);
}

/** Numerical selection keeps a statistical report and skips failed, opened, and irrelevant pages. */
export function chooseDocumentIds(results: Selectable[], investigation: Investigation, limit: number) {
  const eligible = results.filter((item) => item.url.startsWith("https://") && item.retrievalStatus !== "rejected" && item.inDomain !== false);
  if (investigation.numerical) {
    const failedUrls = new Set(results.filter((item) => item.retrievalStatus === "failed" && !previousSizeGate(item.rejection)).map((item) => item.url));
    const suitable = eligible.filter((item) => {
      if (item.retrievalStatus === "retrieved") return false;
      if (item.retrievalStatus === "failed" && !previousSizeGate(item.rejection)) return false;
      if (failedUrls.has(item.url)) return false;
      const host = hostOf(item.domain);
      if (investigation.rejectedSubstitutes.some((blocked) => host.endsWith(blocked))) return false;
      if (!investigation.preferredHosts.some((preferred) => host.endsWith(preferred))) return false;
      if (unsuitablePage(item.title.toLowerCase())) return false;
      return mentionsSeries(item, investigation);
    });
    const ranked = suitable.slice().sort((left, right) => score(right, investigation) - score(left, investigation));
    return ranked.slice(0, Math.max(0, limit)).map((item) => item.id);
  }
  const ranked = eligible.slice().sort((left, right) => score(right, investigation) - score(left, investigation));
  const pool = ranked.filter((item) => !investigation.rejectedSubstitutes.some((host) => hostOf(item.domain).endsWith(host)));
  const chosen = (pool.length ? pool : ranked).slice(0, Math.max(0, limit));
  return chosen.map((item) => item.id);
}

function score(item: Selectable, investigation: Investigation) {
  const host = hostOf(item.domain);
  const focus = (investigation.focusSeries ?? "").toLowerCase();
  const title = item.title.toLowerCase();
  const url = decodedUrl(item.url);
  const snippet = (item.snippet ?? "").toLowerCase();
  let value = 0;
  if (investigation.preferredHosts.some((preferred) => host.endsWith(preferred))) value += 5;
  if (investigation.rejectedSubstitutes.some((blocked) => host.endsWith(blocked))) value -= 4;
  if (focus && title.includes(focus)) value += 20;
  if (focus && url.includes(focus)) value += 10;
  if (/pdfuploads|\.pdf(?:$|\?)/i.test(item.url)) value += 5;
  if (focus && snippet.includes(focus)) value += 2;
  if (/elibrary\/read/i.test(item.url)) value -= 3;
  return value;
}

export type DocumentLedgerStatus = "selected" | "retrieval attempted" | "opened" | "parse succeeded" | "parse failed" | "irrelevant" | "unavailable" | "not opened";

export function documentLedger(results: Selectable[], investigation: Investigation, limit: number) {
  const selected = new Set(chooseDocumentIds(results, investigation, limit));
  const failedByUrl = new Map(results.filter((item) => item.retrievalStatus === "failed").map((item) => [item.url, item.rejection || "The page was not stored."]));
  return results.map((item) => {
    const title = item.title.toLowerCase();
    const host = hostOf(item.domain);
    const substitute = investigation.rejectedSubstitutes.some((blocked) => host.endsWith(blocked));
    const priorFailure = item.retrievalStatus !== "retrieved" && item.retrievalStatus !== "failed" ? failedByUrl.get(item.url) : undefined;
    if (selected.has(item.id) && previousSizeGate(item.rejection)) {
      return { ...item, status: "selected" as const, reason: "The earlier download was refused at the 1200000 byte gate. The file was not stored. A confirmed open downloads it again and counts against the daily limit." };
    }
    if (priorFailure) return { ...item, status: "unavailable" as const, reason: `Retrieval was attempted for this URL. ${priorFailure} It will not be requested again.` };
    if (item.retrievalStatus === "retrieved") {
      const extracted = extractDocument({ text: item.text || "", url: item.url, title: item.title });
      if (extracted.observations.length > 0) return { ...item, status: "parse succeeded" as const, reason: "Retrieval was attempted, the page was opened, and a numerical series was read from the stored passage." };
      if ((item.text || "").trim()) return { ...item, status: "parse failed" as const, reason: extracted.limitation || "Retrieval was attempted and the page was opened. No numerical series was read from the stored passage." };
      return { ...item, status: "opened" as const, reason: "Retrieval was attempted and the page was stored." };
    }
    if (item.retrievalStatus === "failed") return { ...item, status: "unavailable" as const, reason: `Retrieval was attempted. ${item.rejection || "The page was not stored."}` };
    if (selected.has(item.id)) return { ...item, status: "selected" as const, reason: "Selected for the next open. Retrieval has not been attempted." };
    if (substitute || unsuitablePage(title) || (investigation.numerical && !mentionsSeries(item, investigation))) {
      return { ...item, status: "irrelevant" as const, reason: substitute ? "A State House announcement is not a statistical series." : "This saved page is not a statistical series for the question." };
    }
    return { ...item, status: "not opened" as const, reason: "Saved, and not selected for this open." };
  });
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
    const incomplete = extracted.limitation?.includes("may be incomplete") ? extracted.limitation : "";
    readings.push({
      ...source,
      stance: "contextualizes",
      limitation: relevant
        ? `${incomplete ? `${incomplete} ` : ""}An opened document contains a parsed series. The series is evidence of those figures, not a verdict about why they changed.`
        : "An opened page discusses the premise. It is not a statistical series and it is not a verdict.",
    });
  }
  const analysis = investigation.numerical && observations.length ? analyzeSeries(observations, investigation.focusSeries) : null;
  const unpublished = sources.map((source) => source.text || "").join("\n").match(/20\d\d is not in the published series\. It was not filled in\./);
  if (analysis && unpublished && !analysis.limitations.includes(unpublished[0])) analysis.limitations.push(unpublished[0]);
  const incomplete = readings.find((source) => source.limitation?.includes("may be incomplete"))?.limitation;
  if (analysis && incomplete && !analysis.limitations.includes(incomplete)) analysis.limitations.push(incomplete);
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
