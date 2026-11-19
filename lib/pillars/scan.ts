import { plannedScanRequest, scanBudget } from "@/lib/intel/budget";
import { rosterCoverage } from "@/lib/intel/account-roster";
import {
  contentPillars,
  discoveryFor,
  pillarLabels,
  pillarMixLabels,
  pillarTargets,
  type ContentPillar,
  type ScanMode,
} from "@/lib/pillars/catalog";
import { automaticStages, plannedNextStage, type AutomationSettings, type Lifecycle } from "@/lib/editorial/model";
import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";
import { researchExpectation } from "@/lib/pillars/catalog";

export type PillarSignal = {
  pillar: ContentPillar;
  share: number;
  hoursSinceScan: number | null;
  hoursSincePost: number | null;
  queued: number;
  readyDrafts?: number;
  configured?: boolean;
  timeliness: "high" | "medium" | "low";
};

export type ScanAllowance = {
  requestsRemaining: number;
  postsRemaining: number;
  known?: boolean;
};

export type ScanChoice = {
  mode: ScanMode;
  pillar: ContentPillar;
  pillars: ContentPillar[];
  label: string;
  reason: string;
  scope: string;
  maximumPosts: number;
  estimatedRequests: number;
  pillarsSearched: number;
  runnable: boolean;
  unconfigured: ContentPillar[];
  requestNote: string;
};

const enoughQueued = 3;
const rosterRequestEstimate = 2;

function blankSignal(pillar: ContentPillar): PillarSignal {
  return { pillar, share: 0, hoursSinceScan: null, hoursSincePost: null, queued: 0, timeliness: "medium" };
}

function estimateRequests(pillarCount: number) {
  return Math.min(scanBudget.maxXRequestsPerScan, pillarCount + pillarCount * rosterRequestEstimate);
}

export function chooseScan(mode: ScanMode, signals: PillarSignal[], publishedTotal = 0, allowance?: ScanAllowance): ScanChoice {
  const byPillar = new Map(contentPillars.map((pillar) => [pillar, signals.find((item) => item.pillar === pillar) ?? blankSignal(pillar)]));
  const listed = [...byPillar.values()];
  const configured = listed.filter((item) => item.configured !== false).map((item) => item.pillar);
  const unconfigured = listed.filter((item) => item.configured === false).map((item) => item.pillar);
  const pillars: ContentPillar[] = mode === "smart"
    ? (configured.length > 0 ? configured : [...contentPillars])
    : [mode];
  const focus = mode === "smart" ? smartPillar(listed, publishedTotal) : mode;
  const plan = plannedScanRequest(scanBudget.maxPostsPerRequest, estimateRequests(pillars.length));
  const blocked = budgetBlock(allowance, plan.requests, plan.posts * plan.requests);
  const missingConfigured = mode !== "smart" && listed.find((item) => item.pillar === mode)?.configured === false;
  const runnable = !missingConfigured && blocked == null && pillars.length > 0;
  const coverage = rosterCoverage(pillars);
  return {
    mode,
    pillar: focus,
    pillars,
    label: mode === "smart" ? pillars.map((pillar) => pillarLabels[pillar]).join(", ") : pillarLabels[mode],
    reason: reasonFor(mode, focus, pillars, byPillar.get(focus) ?? blankSignal(focus), publishedTotal, listed, blocked, coverage.accounts),
    scope: mode === "smart"
      ? pillars.map((pillar) => discoveryFor(pillar).scope).join(" · ")
      : discoveryFor(mode).scope,
    maximumPosts: plan.posts * plan.requests,
    estimatedRequests: plan.requests,
    pillarsSearched: pillars.length,
    runnable,
    unconfigured,
    requestNote: `${plan.note} This plan covers ${coverage.accounts} shortlist handles across the selected pillars.`,
  };
}

function smartPillar(signals: PillarSignal[], publishedTotal: number): ContentPillar {
  const usable = signals.filter((signal) => signal.configured !== false);
  if (publishedTotal < 1) {
    if (usable.some((signal) => signal.pillar === "politics")) return "politics";
    return usable[0]?.pillar ?? "politics";
  }
  const pool = usable.length > 0 ? usable : signals;
  const ranked = pool
    .map((signal) => ({ signal, score: discoveryScore(signal) }))
    .sort((left, right) => right.score - left.score || contentPillars.indexOf(left.signal.pillar) - contentPillars.indexOf(right.signal.pillar));
  return ranked[0]?.signal.pillar ?? "politics";
}

function discoveryScore(signal: PillarSignal) {
  if (signal.configured === false) return -1000;
  const gap = Math.max(0, pillarTargets[signal.pillar] - signal.share);
  let score = gap;
  if (signal.queued >= enoughQueued) score -= 50;
  if ((signal.readyDrafts ?? 0) >= 2) score -= 40;
  score += signal.hoursSinceScan == null ? 12 : Math.min(18, signal.hoursSinceScan / 12);
  score += signal.hoursSincePost == null ? 4 : Math.min(8, signal.hoursSincePost / 48);
  if (signal.timeliness === "high") score += 3;
  if (signal.timeliness === "low") score -= 2;
  return score;
}

function budgetBlock(allowance: ScanAllowance | undefined, requests: number, posts: number) {
  if (!allowance) return null;
  if (allowance.known === false) return "Usage tracking is not readable. No search will be sent.";
  if (allowance.requestsRemaining < requests) return `The daily X request limit leaves ${allowance.requestsRemaining}, and this multi-pillar scan asks for ${requests}. No search will be sent.`;
  if (allowance.postsRemaining < posts) return `The daily post ceiling leaves ${allowance.postsRemaining} reads, and this scan asks for up to ${posts}. No search will be sent.`;
  return null;
}

function reasonFor(
  mode: ScanMode,
  focus: ContentPillar,
  pillars: ContentPillar[],
  signal: PillarSignal,
  publishedTotal: number,
  signals: PillarSignal[],
  blocked: string | null,
  rosterCount: number,
) {
  const missing = signals.filter((item) => item.configured === false).map((item) => pillarLabels[item.pillar]);
  const missingLine = missing.length === 0 ? "" : `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unconfigured. `;
  if (mode !== "smart" && signal.configured === false) {
    return `${missingLine}${pillarLabels[mode]} is unconfigured. No usable search group is stored, so no scan will be sent.`;
  }
  let base: string;
  if (mode === "smart") {
    const labels = pillars.map((pillar) => pillarLabels[pillar]).join(", ");
    base = publishedTotal < 1
      ? `One pipeline run searches ${labels} together — keyword groups plus ${rosterCount} shortlist handles.`
      : `One pipeline run searches ${labels} together (keywords + shortlist from:). Focus note: ${pillarLabels[focus]} is currently the thinnest mix signal.`;
  } else {
    base = `You chose ${pillarLabels[mode]}. Keyword discovery and that pillar's shortlist handles run in the same scan.`;
  }
  return `${missingLine}${base}${blocked ? ` ${blocked}` : ""}`;
}

export type MixPost = { pillar: ContentPillar | null };

export function contentMix(posts: MixPost[], limit = 20) {
  const recent = posts.slice(0, limit);
  const counts: Record<ContentPillar, number> = { politics: 0, finance: 0, manchester_united: 0 };
  for (const post of recent) {
    if (post.pillar) counts[post.pillar] += 1;
  }
  const total = recent.length;
  return {
    counted: total,
    window: limit,
    items: contentPillars.map((pillar) => ({
      pillar,
      label: pillarMixLabels[pillar],
      count: counts[pillar],
      share: total ? Math.round((counts[pillar] / total) * 100) : 0,
      target: pillarTargets[pillar],
    })),
  };
}

export function rankByQuality<T extends { id: string; quality: number; timeliness: number }>(items: T[]) {
  return items.slice().sort((left, right) => right.quality - left.quality || right.timeliness - left.timeliness || left.id.localeCompare(right.id));
}

export function pillarProgress(
  item: { pillar: ContentPillar; type: OpportunityType; factual: boolean; worthTalkingAbout?: boolean },
  settings: AutomationSettings = { autoProgressToEditor: true, researchRecommended: false },
) {
  const researchNeed = researchExpectation(item.pillar, item.type, item.factual);
  const worthTalkingAbout = item.worthTalkingAbout !== false;
  const lifecycle: Lifecycle = "RANKED";
  const plan = {
    worthTalkingAbout,
    researchNeed,
    lifecycle,
  };
  return {
    researchNeed,
    next: plannedNextStage(plan, settings),
    stages: automaticStages(plan, settings),
    executed: false as const,
    externalCalls: [] as const,
  };
}

export function carriesPillar(pillar: ContentPillar) {
  const stored = pillar === "manchester_united" ? "football" : pillar;
  return { opportunity: stored, draft: stored, published: stored, text: "unchanged" as const };
}

export type { ResearchNeed };
