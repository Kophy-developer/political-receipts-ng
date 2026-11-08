import { plannedScanRequest } from "@/lib/intel/budget";
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
  label: string;
  reason: string;
  scope: string;
  maximumPosts: number;
  estimatedRequests: number;
  pillarsSearched: 1;
  runnable: boolean;
  unconfigured: ContentPillar[];
  requestNote: string;
};

const enoughQueued = 3;

function blankSignal(pillar: ContentPillar): PillarSignal {
  return { pillar, share: 0, hoursSinceScan: null, hoursSincePost: null, queued: 0, timeliness: "medium" };
}

export function chooseScan(mode: ScanMode, signals: PillarSignal[], publishedTotal = 0, allowance?: ScanAllowance): ScanChoice {
  const byPillar = new Map(contentPillars.map((pillar) => [pillar, signals.find((item) => item.pillar === pillar) ?? blankSignal(pillar)]));
  const listed = [...byPillar.values()];
  const pillar = mode === "smart" ? smartPillar(listed, publishedTotal) : mode;
  const signal = byPillar.get(pillar) ?? blankSignal(pillar);
  const plan = plannedScanRequest();
  const unconfigured = listed.filter((item) => item.configured === false).map((item) => item.pillar);
  const blocked = budgetBlock(allowance, plan.posts);
  const runnable = signal.configured !== false && blocked == null;
  return {
    mode,
    pillar,
    label: pillarLabels[pillar],
    reason: reasonFor(mode, pillar, signal, publishedTotal, listed, blocked),
    scope: discoveryFor(pillar).scope,
    maximumPosts: plan.posts,
    estimatedRequests: plan.requests,
    pillarsSearched: 1,
    runnable,
    unconfigured,
    requestNote: plan.note,
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

function budgetBlock(allowance: ScanAllowance | undefined, posts: number) {
  if (!allowance) return null;
  if (allowance.known === false) return "Usage tracking is not readable. No search will be sent.";
  if (allowance.requestsRemaining < 1) return "The daily X request limit is already used. No search will be sent.";
  if (allowance.postsRemaining < posts) return `The daily post ceiling leaves ${allowance.postsRemaining} reads, and this scan asks for ${posts}. No search will be sent.`;
  return null;
}

function reasonFor(mode: ScanMode, pillar: ContentPillar, signal: PillarSignal, publishedTotal: number, signals: PillarSignal[], blocked: string | null) {
  const label = pillarLabels[pillar];
  if (signal.configured === false) {
    return `${label} is unconfigured. No usable search group is stored, so no scan will be sent.`;
  }
  const missing = signals.filter((item) => item.configured === false).map((item) => pillarLabels[item.pillar]);
  const missingLine = missing.length === 0 ? "" : `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unconfigured. `;
  let base: string;
  if (mode !== "smart") base = `You chose ${label}.`;
  else if (publishedTotal < 1) base = "No published mix yet. Politics stays the opening scan.";
  else {
    const gap = pillarTargets[pillar] - signal.share;
    if (gap >= 10 && signal.queued < enoughQueued && (signal.readyDrafts ?? 0) < 2) base = `${label} is currently underrepresented in your recent content.`;
    else if (signal.hoursSinceScan == null) base = `${label} has not been scanned yet.`;
    else base = `${label} has gone the longest without a scan.`;
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
