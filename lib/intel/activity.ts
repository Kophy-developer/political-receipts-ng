import { publishedRates, scanBudget } from "@/lib/intel/budget";
import { postsAreSameTopic } from "@/lib/intel/cluster";
import { metricLabel, type PostMetrics } from "@/lib/intel/metrics";
import { publicPostUrl } from "@/lib/intel/text";

export type ActivityInput = {
  id: string;
  text: string;
  authorId: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string | null;
  retrievedAt: string | null;
  scanId: string | null;
  deskConversationId: string | null;
  xConversationId: string | null;
  referenced: Array<{ type: string; id: string }>;
  metrics: PostMetrics;
  pillar: string | null;
};

export type ActivityCard = {
  id: string;
  text: string;
  username: string | null;
  displayName: string | null;
  postedAt: string | null;
  collectedAt: string | null;
  url: string | null;
  membership: "original" | "exact" | "related";
  reference: string | null;
  metrics: Array<{ label: string; value: string }>;
};

export type ActivityModel = {
  original: ActivityCard | null;
  originalState: "present" | "absent" | "unknown";
  absentId: string | null;
  exact: ActivityCard[];
  related: ActivityCard[];
  collapsedDuplicates: number;
  context: string;
  lookup: { requests: 1; posts: 1; allowed: boolean; note: string } | null;
};

const metricNames: Array<[keyof PostMetrics, string]> = [
  ["likes", "Likes"],
  ["replies", "Replies"],
  ["reposts", "Reposts"],
  ["quotes", "Quotes"],
  ["bookmarks", "Bookmarks"],
  ["views", "Views"],
];

function referenceLabel(referenced: ActivityInput["referenced"]) {
  const type = referenced.find((item) => item.type === "replied_to" || item.type === "quoted" || item.type === "retweeted")?.type;
  if (type === "replied_to") return "Reply";
  if (type === "quoted") return "Quote";
  if (type === "retweeted") return "Repost";
  return null;
}

function cardFrom(post: ActivityInput, membership: ActivityCard["membership"]): ActivityCard {
  return {
    id: post.id,
    text: post.text,
    username: post.username,
    displayName: post.displayName,
    postedAt: post.createdAt,
    collectedAt: post.retrievedAt,
    url: publicPostUrl(post.id, post.username),
    membership,
    reference: membership === "original" ? "Original post" : referenceLabel(post.referenced),
    metrics: metricNames.map(([key, label]) => ({ label, value: metricLabel(post.metrics[key]) })),
  };
}

function byTime(left: ActivityInput, right: ActivityInput) {
  return (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.id.localeCompare(right.id);
}

function dedupe(posts: ActivityInput[]) {
  const kept = new Map<string, ActivityInput>();
  let collapsed = 0;
  for (const post of posts) {
    const previous = kept.get(post.id);
    if (!previous) {
      kept.set(post.id, post);
      continue;
    }
    collapsed += 1;
    const previousTime = previous.retrievedAt ?? "";
    const nextTime = post.retrievedAt ?? "";
    if (nextTime >= previousTime) kept.set(post.id, post);
  }
  return { posts: [...kept.values()], collapsed };
}

export function lookupCost(input: { requestsRemaining: number; postsRemaining: number; known: boolean }) {
  const allowed = input.known && input.requestsRemaining >= 1 && input.postsRemaining >= 1;
  const rate = `The published post-read rate is $${publishedRates.postReadUsd.toFixed(3)}. That is not a live invoice.`;
  const note = input.known
    ? `Looking up the missing original post uses 1 X request and reads 1 post. ${input.requestsRemaining} of ${scanBudget.dailyXRequests} requests and ${input.postsRemaining} of ${scanBudget.dailyPosts} post reads remain today. ${rate} Nothing is posted.`
    : "Today's X allowance could not be read. No lookup was sent.";
  return { requests: 1 as const, posts: 1 as const, allowed, note: allowed ? note : `${note} The daily ceiling blocks this lookup.` };
}

export function conversationActivity(
  posts: ActivityInput[],
  focus: { postId?: string | null; text?: string | null; deskConversationId?: string | null; pillar?: string | null },
  allowance: { requestsRemaining: number; postsRemaining: number; known: boolean },
): ActivityModel {
  const { posts: unique, collapsed } = dedupe(posts);
  const focusPost = unique.find((post) => focus.postId && post.id === focus.postId)
    ?? unique.find((post) => focus.text && post.text === focus.text)
    ?? unique.find((post) => focus.deskConversationId && post.deskConversationId === focus.deskConversationId)
    ?? null;
  const conversationId = focusPost?.xConversationId ?? null;
  const deskId = focus.deskConversationId ?? focusPost?.deskConversationId ?? null;
  const focusText = focusPost?.text ?? focus.text ?? "";
  const exactPosts = conversationId ? unique.filter((post) => post.xConversationId === conversationId).sort(byTime) : [];
  const outside = (post: ActivityInput) => !conversationId || post.xConversationId !== conversationId;
  const relatedPosts = unique
    .filter(outside)
    .filter((post) => (deskId && post.deskConversationId === deskId) || (focusText && post.text !== focusText && postsAreSameTopic(focusText, post.text)))
    .sort(byTime);
  const originalPost = conversationId ? exactPosts.find((post) => post.id === conversationId) ?? null : null;
  const originalState = conversationId ? (originalPost ? "present" : "absent") : "unknown";
  const pillar = focus.pillar ?? focusPost?.pillar;
  const context = pillar === "politics" || pillar === null || pillar === undefined
    ? "Engagement is context for what is being discussed. It does not identify the original author, it does not decide whether a claim is true, and it is not used to optimize a post for an audience."
    : "Engagement is context for what is being discussed. It does not identify the original author, and it does not decide whether a claim is true.";
  return {
    original: originalPost ? cardFrom(originalPost, "original") : null,
    originalState,
    absentId: originalState === "absent" ? conversationId : null,
    exact: exactPosts.filter((post) => post.id !== originalPost?.id).map((post) => cardFrom(post, "exact")),
    related: relatedPosts.map((post) => cardFrom(post, "related")),
    collapsedDuplicates: collapsed,
    context,
    lookup: originalState === "absent" ? lookupCost(allowance) : null,
  };
}
