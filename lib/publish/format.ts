import { characterCount } from "@/lib/format";
import { standardPostLimit, uncheckedCapability, type PublishCapability } from "@/lib/publish/capability";

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

/** Packs whole sentences into standard posts. A sentence longer than the limit stays whole. */
export function splitForThread(text: string, limit = standardPostLimit) {
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

export function openingFormat(text: string, capability: PublishCapability): PostFormat {
  const count = characterCount(text);
  if (capability.longForm && count > capability.standardPostLimit && count <= capability.maximum) return "long";
  return "unset";
}

export function publishPlan(input: {
  text: string;
  format: PostFormat;
  posts?: string[] | null;
  capability?: PublishCapability;
}): PublishPlan {
  const capability = input.capability ?? uncheckedCapability;
  const text = input.text;
  const count = characterCount(text);
  if (!text.trim()) return { label: "Empty", send: false, posts: [], reason: "The final post is empty." };
  if (input.format === "thread") {
    const posts = input.posts && input.posts.length > 0 ? input.posts : splitForThread(text).posts;
    const oversize = posts.some((post) => characterCount(post) > capability.standardPostLimit);
    return {
      label: `Thread (${posts.length} ${posts.length === 1 ? "post" : "posts"})`,
      send: false,
      posts,
      reason: oversize
        ? "A thread post is still over 280 characters. Automatic thread publishing: Not enabled. Nothing will be sent."
        : "Automatic thread publishing: Not enabled. None of these posts will be sent.",
    };
  }
  if (count > capability.maximum) {
    return {
      label: "Too long",
      send: false,
      posts: [text],
      reason: `This post is ${count} characters. The current limit is ${capability.maximum}. It was not shortened, and it will not be sent.`,
    };
  }
  if (count <= capability.standardPostLimit) {
    return { label: "Single post", send: true, posts: [text], reason: null };
  }
  if (capability.longForm && input.format !== "short") {
    return { label: "Long post", send: true, posts: [text], reason: null };
  }
  return {
    label: "Single post",
    send: false,
    posts: [text],
    reason: `This post is ${count} characters. The standard limit is ${capability.standardPostLimit}. It was not shortened, and it will not be sent.`,
  };
}
