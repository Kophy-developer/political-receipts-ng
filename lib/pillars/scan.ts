import { scanBudget } from "@/lib/intel/budget";
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
  timeliness: "high" | "medium" | "low";
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
};

const enoughQueued = 3;

function blankSignal(pillar: ContentPillar): PillarSignal {
  return { pillar, share: 0, hoursSinceScan: null, hoursSincePost: null, queued: 0, timeliness: "medium" };
}

export function chooseScan(mode: ScanMode, signals: PillarSignal[], publishedTotal = 0): ScanChoice {
  const byPillar = new Map(contentPillars.map((pillar) => [pillar, signals.find((item) => item.pillar === pillar) ?? blankSignal(pillar)]));
  const pillar = mode === "smart" ? smartPillar([...byPillar.values()], publishedTotal) : mode;
  const signal = byPillar.get(pillar) ?? blankSignal(pillar);
  return {
    mode,
    pillar,
    label: pillarLabels[pillar],
    reason: reasonFor(mode, pillar, signal, publishedTotal),
    scope: discoveryFor(pillar).scope,
    maximumPosts: scanBudget.maxPostsPerScan,
    estimatedRequests: scanBudget.maxXRequestsPerScan,
    pillarsSearched: 1,
  };
}

function smartPillar(signals: PillarSignal[], publishedTotal: number): ContentPillar {
  if (publishedTotal < 1) return "politics";
  const ranked = signals
    .map((signal) => ({ signal, score: discoveryScore(signal) }))
    .sort((left, right) => right.score - left.score || contentPillars.indexOf(left.signal.pillar) - contentPillars.indexOf(right.signal.pillar));
  return ranked[0]?.signal.pillar ?? "politics";
}

function discoveryScore(signal: PillarSignal) {
  const gap = Math.max(0, pillarTargets[signal.pillar] - signal.share);
  let score = gap;
  if (signal.queued >= enoughQueued) score -= 50;
  score += signal.hoursSinceScan == null ? 12 : Math.min(18, signal.hoursSinceScan / 12);
  score += signal.hoursSincePost == null ? 4 : Math.min(8, signal.hoursSincePost / 48);
  if (signal.timeliness === "high") score += 3;
  if (signal.timeliness === "low") score -= 2;
  return score;
}

function reasonFor(mode: ScanMode, pillar: ContentPillar, signal: PillarSignal, publishedTotal: number) {
  const label = pillarLabels[pillar];
  if (mode !== "smart") return `You chose ${label}.`;
  if (publishedTotal < 1) return "No published mix yet. Politics stays the opening scan.";
  const gap = pillarTargets[pillar] - signal.share;
  if (gap >= 10 && signal.queued < enoughQueued) return `${label} is currently underrepresented in your recent content.`;
  if (signal.hoursSinceScan == null) return `${label} has not been scanned yet.`;
  return `${label} has gone the longest without a scan.`;
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
