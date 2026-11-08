import { contentPillarFromStorage, type ContentPillar } from "@/lib/pillars/catalog";
import type { ReadyDraft, ReadyItem } from "@/lib/publisher/types";

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function draftsFromDevelopment(value: unknown): ReadyDraft[] {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.drafts)) return [];
  return row.drafts.flatMap((item) => {
    const draft = asRecord(item);
    const text = textOf(draft?.text);
    if (!text) return [];
    return [{
      style: textOf(draft?.style) ?? "draft",
      text,
      sourceHash: textOf(draft?.sourceHash),
    }];
  });
}

export function caveatsFromDevelopment(value: unknown, possibleAngle: string | null): string[] {
  const row = asRecord(value);
  const angle = textOf(row?.angle) ?? possibleAngle;
  const unresolved = textOf(row?.unresolved);
  const lines = [angle, unresolved].filter((item): item is string => Boolean(item));
  const analysis = asRecord(row?.analysis);
  const limits = Array.isArray(analysis?.limits)
    ? analysis.limits.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))
    : [];
  return [...lines, ...limits].slice(0, 6);
}

export function sourceFromDevelopment(value: unknown): { sourceUrl: string | null; chartUrl: string | null } {
  const row = asRecord(value);
  const analysis = asRecord(row?.analysis);
  const chart = asRecord(analysis?.chart);
  return {
    sourceUrl: textOf(analysis?.url) ?? textOf(chart?.url),
    chartUrl: textOf(chart?.url) ?? textOf(analysis?.url),
  };
}

export function readyItemFromRow(input: {
  id: string;
  claimId: string;
  pillar: string | null;
  claim: string;
  whatHappened: string | null;
  possibleAngle: string | null;
  development: unknown;
  updatedAt: string | null;
}): ReadyItem | null {
  const drafts = draftsFromDevelopment(input.development);
  if (drafts.length === 0 || !input.claimId) return null;
  const development = asRecord(input.development);
  if (development && development.ready !== true) return null;
  const pillar = contentPillarFromStorage(input.pillar) ?? "politics";
  const links = sourceFromDevelopment(input.development);
  return {
    id: input.id,
    claimId: input.claimId,
    pillar,
    claim: input.claim,
    why: textOf(input.possibleAngle) ?? textOf(input.whatHappened) ?? "This draft is ready for a decision.",
    caveats: caveatsFromDevelopment(input.development, input.possibleAngle),
    sourceUrl: links.sourceUrl,
    chartUrl: links.chartUrl,
    drafts,
    readyAt: input.updatedAt,
  };
}

export function noticeFor(count: number) {
  if (count < 1) return { count: 0, message: "No drafts are waiting." };
  return { count, message: count === 1 ? "1 draft is ready for you." : `${count} drafts are ready for you.` };
}

export function pillarLabel(pillar: ContentPillar) {
  if (pillar === "manchester_united") return "Manchester United";
  if (pillar === "finance") return "Finance";
  return "Politics";
}
