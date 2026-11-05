import { characterCount } from "@/lib/format";
import { currentPublishLimit, publishingCapability } from "@/lib/publish/capability";

export type PostFormat = "unset" | "long" | "thread" | "short";

export type PublishPlan = {
  label: string;
  send: boolean;
  posts: string[];
  reason: string | null;
};

function sentencesIn(paragraph: string) {
  const flat = paragraph.replace(/\s*\n\s*/g, " ").trim();
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-Z#“"])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Packs whole sentences. A sentence longer than the limit stays whole. */
export function splitForThread(text: string, limit = currentPublishLimit()) {
  const units = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap(sentencesIn);
  const posts: string[] = [];
  let current = "";
  let oversizeSentence = false;
  for (const unit of units) {
    if (characterCount(unit) > limit) {
      if (current) posts.push(current);
      posts.push(unit);
      current = "";
      oversizeSentence = true;
      continue;
    }
    const next = current ? `${current} ${unit}` : unit;
    if (characterCount(next) <= limit) current = next;
    else {
      if (current) posts.push(current);
      current = unit;
    }
  }
  if (current) posts.push(current);
  return { posts: posts.length ? posts : text.trim() ? [text.trim()] : [], oversizeSentence };
}

export function threadText(posts: string[]) {
  return posts.map((post) => post.trimEnd()).filter((post) => post.trim()).join("\n\n");
}

export function publishPlan(input: { text: string; format: PostFormat; posts?: string[] | null }): PublishPlan {
  const limit = currentPublishLimit();
  const text = input.text;
  const count = characterCount(text);
  if (!text.trim()) return { label: "Empty", send: false, posts: [], reason: "The final post is empty." };
  const over = count > limit;
  if (input.format === "thread") {
    const posts = input.posts && input.posts.length > 0 ? input.posts : splitForThread(text).posts;
    const oversize = posts.some((post) => characterCount(post) > limit);
    return {
      label: `Thread (${posts.length} ${posts.length === 1 ? "post" : "posts"})`,
      send: false,
      posts,
      reason: oversize
        ? "A thread post is still over the current limit, and thread publishing is not available yet. Nothing will be sent."
        : "Thread publishing is not available yet. None of these posts will be sent.",
    };
  }
  if (!over && input.format !== "long") {
    return { label: "Single post", send: publishingCapability.singlePostPublishing, posts: [text], reason: null };
  }
  if (input.format === "unset") {
    return { label: "Not chosen", send: false, posts: [text], reason: "Choose a post format before review." };
  }
  if (input.format === "long" || publishingCapability.longPostSupported !== "yes") {
    if (input.format === "long") {
      return {
        label: "Long post",
        send: false,
        posts: [text],
        reason: "Long-post publishing is not verified, so this will not be sent.",
      };
    }
  }
  return {
    label: "Single post",
    send: false,
    posts: [text],
    reason: `This post is ${count} characters. The current publish limit is ${limit}. It was not shortened, and it will not be sent.`,
  };
}
