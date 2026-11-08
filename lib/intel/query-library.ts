import type { StoredGroup } from "@/lib/pillars/groups";
import { queryAudit, sampledGroups, tightenedQueries, type GroupSample } from "@/lib/intel/query-evidence";

export type QuerySelection = {
  slug: string;
  name: string;
  storedQuery: string;
  requestQuery: string;
  reason: string;
  evidence: string[];
  limitations: string[];
  editorChosen: boolean;
  sampled: boolean;
  tightened: boolean;
  posts: number;
  maxReplies: number | null;
};

export type QueryRosterItem = QuerySelection & {
  selected: boolean;
  score: number;
  enabled: boolean;
};

export function sampleFor(slug: string): GroupSample | null {
  return sampledGroups[slug] ?? null;
}

export function discoveryScore(slug: string, lastUsedAt: string | null, now: number) {
  const sample = sampleFor(slug);
  if (!sample || sample.posts === 0) return -50;
  const kept = sample.posts - sample.noisePosts;
  const hours = lastUsedAt ? Math.max(0, (now - Date.parse(lastUsedAt)) / 3_600_000) : 0;
  const freshness = Math.min(24, hours / 4);
  return kept * 10 + sample.actionablePosts * 12 - sample.notPoliticalPosts * 15 - sample.offTopicPosts * 12 + freshness;
}

function linesFor(sample: GroupSample | null, tightened: { because: string } | null): { evidence: string[]; limitations: string[] } {
  if (!sample) {
    return {
      evidence: ["No stored posts. This group was not among the 8 pages the desk has retrieved."],
      limitations: [queryAudit.sampleLimit, "An unsampled group is not treated as promising."],
    };
  }
  const evidence = [
    `${sample.posts} stored posts, posted from ${sample.postedFrom} to ${sample.postedTo}.`,
    ...sample.phrases.filter((item) => item.posts > 0).map((item) => `${item.phrase} appeared in ${item.posts} of ${sample.posts}.`),
    `${sample.discussionPosts} marked discussion, ${sample.actionablePosts} actionable, ${sample.noisePosts} noise, ${sample.notPoliticalPosts} not political.`,
    `Highest replies ${sample.maxReplies}. Highest likes ${sample.maxLikes}. Likes are not a truth score.`,
    ...sample.duplicates,
    ...sample.irrelevant,
  ];
  const limitations = [
    ...sample.limitations,
    sample.maxReplies < 20 ? `None of these posts reached 20 replies. Across all ${queryAudit.distinctPosts} stored posts, ${queryAudit.repliesAtLeast20} reached 20 replies.` : "",
    tightened ? tightened.because : "",
    queryAudit.googleTrends,
    queryAudit.fullArchive,
  ].filter(Boolean);
  return { evidence, limitations };
}

function describe(group: StoredGroup, now: number, editorChosen: boolean): QuerySelection {
  const sample = sampleFor(group.slug);
  const tight = tightenedQueries[group.slug] ?? null;
  const copy = linesFor(sample, tight);
  const requestQuery = tight?.query ?? group.query;
  const score = discoveryScore(group.slug, group.lastUsedAt, now);
  const reason = editorChosen
    ? `You chose ${group.name}. The evidence ranking is not used for this scan.`
    : sample
      ? `${group.name} has the highest evidence score in this pillar (${score.toFixed(1)}). The score uses stored relevance, actionable marks, off-topic matches, and how long the group has waited. It does not use likes, and it does not treat replies as proof.`
      : `${group.name} has no stored sample. It is used only because you chose it.`;
  return {
    slug: group.slug,
    name: group.name,
    storedQuery: group.query,
    requestQuery,
    reason,
    evidence: copy.evidence,
    limitations: copy.limitations,
    editorChosen,
    sampled: Boolean(sample),
    tightened: requestQuery !== group.query,
    posts: sample?.posts ?? 0,
    maxReplies: sample?.maxReplies ?? null,
  };
}

/** One group for one scan. Unsampled groups stay out of the automatic choice while a sampled group is enabled. */
export function selectDiscoveryQuery(input: {
  groups: StoredGroup[];
  pillar: StoredGroup["pillar"];
  preferenceSlug?: string | null;
  now?: number;
}): { selected: QuerySelection; roster: QueryRosterItem[] } | null {
  const now = input.now ?? Date.now();
  const pillarGroups = input.groups.filter((group) => group.pillar === input.pillar);
  const enabled = pillarGroups.filter((group) => group.enabled && group.query.trim().length > 0 && group.query.length <= 480);
  if (enabled.length === 0) return null;
  const ranked = enabled
    .map((group) => ({ group, score: discoveryScore(group.slug, group.lastUsedAt, now) }))
    .sort((left, right) => right.score - left.score || left.group.name.localeCompare(right.group.name));
  const sampled = ranked.filter((item) => sampleFor(item.group.slug));
  const preferred = input.preferenceSlug ? enabled.find((group) => group.slug === input.preferenceSlug) ?? null : null;
  const chosen = preferred ?? (sampled[0]?.group ?? ranked[0].group);
  const selected = describe(chosen, now, Boolean(preferred));
  const roster = pillarGroups
    .map((group) => {
      const item = describe(group, now, preferred?.slug === group.slug);
      return { ...item, selected: group.slug === chosen.slug, score: discoveryScore(group.slug, group.lastUsedAt, now), enabled: group.enabled };
    })
    .sort((left, right) => Number(right.selected) - Number(left.selected) || right.score - left.score || left.name.localeCompare(right.name));
  return { selected, roster };
}

export { queryAudit };
