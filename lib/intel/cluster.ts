import { distinctiveTokens, plainPost } from "@/lib/intel/text";

export type ClusterEntity = {
  name: string;
  aliases: string[];
};

export type Clusterable = {
  id: string;
  text: string;
  conversationId: string | null;
};

export type DiscussionCluster<T extends Clusterable> = {
  key: string;
  posts: T[];
  title: string;
  entityNames: string[];
};

function namesOf(text: string, entities: ClusterEntity[]) {
  const haystack = text.toLowerCase();
  return entities
    .filter((entity) => [entity.name, ...entity.aliases].some((label) => label.length > 1 && haystack.includes(label.toLowerCase())))
    .map((entity) => entity.name);
}

function entitySkip(entities: ClusterEntity[]) {
  const skip = new Set<string>();
  for (const entity of entities) {
    for (const label of [entity.name, ...entity.aliases]) {
      for (const part of label.toLowerCase().split(/[^a-z0-9]+/)) {
        if (part.length > 2) skip.add(part.replace(/(ing|ed|es|s)$/, ""));
      }
    }
  }
  return skip;
}

function sharedCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function sameStatement(leftText: string, rightText: string, left: Set<string>, right: Set<string>) {
  const a = plainPost(leftText).toLowerCase();
  const b = plainPost(rightText).toLowerCase();
  if (a.length > 50 && b.length > 50) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (longer.includes(shorter.slice(0, 70))) return true;
  }
  const shared = sharedCount(left, right);
  const union = left.size + right.size - shared;
  const score = union ? shared / union : 0;
  return shared >= 4 && score >= 0.25;
}

function sentencesOf(text: string) {
  const masked = text.replace(/\b(Dr|Mr|Mrs|Ms|Prof|St|Gen|Hon|Jr|Sr)\./gi, (match) => match.replace(".", "•"));
  return masked
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/•/g, ".").trim())
    .filter(Boolean);
}

export function discussionTitle(texts: string[]) {
  const cleaned = texts.map((text) => plainPost(text)).filter(Boolean);
  const sentences = cleaned.flatMap(sentencesOf).filter((sentence) => sentence.length >= 24);
  const pool = sentences.length ? sentences : cleaned;
  const sentence = [...pool].sort((left, right) => right.length - left.length)[0] || "Discussion";
  return sentence.slice(0, 140);
}

export function postsAreSameTopic(leftText: string, rightText: string) {
  const left = new Set(distinctiveTokens(leftText));
  const right = new Set(distinctiveTokens(rightText));
  return sameStatement(leftText, rightText, left, right);
}

export function clusterPosts<T extends Clusterable>(posts: T[], entities: ClusterEntity[]): DiscussionCluster<T>[] {
  const parent = posts.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    return cursor;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  const threads = new Map<string, number[]>();
  posts.forEach((post, index) => {
    if (!post.conversationId) return;
    threads.set(post.conversationId, [...(threads.get(post.conversationId) ?? []), index]);
  });
  for (const indexes of threads.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes.slice(1)) union(indexes[0], index);
  }
  const skip = entitySkip(entities);
  const prepared = posts.map((post) => ({
    entities: namesOf(post.text, entities),
    tokens: new Set(distinctiveTokens(post.text, skip)),
  }));
  for (let left = 0; left < posts.length; left += 1) {
    for (let right = left + 1; right < posts.length; right += 1) {
      if (sameStatement(posts[left].text, posts[right].text, prepared[left].tokens, prepared[right].tokens)) union(left, right);
    }
  }
  const groups = new Map<number, number[]>();
  posts.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  return [...groups.values()].map((indexes) => {
    const members = indexes.map((index) => posts[index]);
    const entityNames = [...new Set(indexes.flatMap((index) => prepared[index].entities))].slice(0, 4);
    const sets = indexes.map((index) => prepared[index].tokens);
    let shared = new Set(sets[0]);
    for (const tokens of sets.slice(1)) shared = new Set([...shared].filter((token) => tokens.has(token)));
    const words = [...(shared.size ? shared : sets[0])].sort().slice(0, 6);
    const who = entityNames.map((name) => name.toLowerCase()).sort().join("+");
    const contentKey = `${who}|${words.join("+")}`.replace(/[^a-z0-9+|]/g, "").slice(0, 160);
    return {
      key: members.length === 1 ? `post:${members[0].id}` : contentKey || members[0].id,
      posts: members,
      title: discussionTitle(members.map((post) => post.text)),
      entityNames,
    };
  });
}
