import { characterCount, POST_LIMIT } from "@/lib/format";

export const storyStages = [
  { id: "discover", label: "Discover" },
  { id: "investigate", label: "Investigate" },
  { id: "decide", label: "Decide" },
  { id: "write", label: "Write" },
  { id: "review", label: "Review" },
  { id: "publish", label: "Publish" },
] as const;

export type StoryStage = (typeof storyStages)[number]["id"];

export type NextAction = "INVESTIGATE" | "REVIEW EVIDENCE" | "CHOOSE VERDICT" | "WRITE POST" | "REVIEW POST" | "PUBLISH";

export type StoryFacts = {
  hasConversation: boolean;
  acceptedEvidence: number;
  verdictRecorded: boolean;
  angleChosen: boolean;
  finalText: string;
};

const actionFor: Record<StoryStage, NextAction> = {
  discover: "INVESTIGATE",
  investigate: "REVIEW EVIDENCE",
  decide: "CHOOSE VERDICT",
  write: "WRITE POST",
  review: "REVIEW POST",
  publish: "PUBLISH",
};

export function storyStage(facts: StoryFacts): StoryStage {
  if (!facts.hasConversation) return "discover";
  if (!facts.verdictRecorded && facts.acceptedEvidence === 0) return "investigate";
  if (!facts.verdictRecorded || !facts.angleChosen) return "decide";
  if (!facts.finalText.trim()) return "write";
  return "review";
}

export function nextAction(facts: StoryFacts): NextAction {
  return actionFor[storyStage(facts)];
}

export function completedStages(current: StoryStage): StoryStage[] {
  const index = storyStages.findIndex((stage) => stage.id === current);
  return storyStages.slice(0, index).map((stage) => stage.id);
}

export type EvidenceBrief = {
  independent: number;
  primary: number;
  line: string;
};

export function evidenceBrief(
  items: Array<{ review: string; tier: string }>,
  recorded: Array<{ kind: string }> = [],
): EvidenceBrief {
  const accepted = items.filter((item) => item.review === "accepted");
  const fromRows = {
    independent: accepted.filter((item) => item.tier === "Established News Organization" || item.tier === "Independent Fact Checker").length,
    primary: accepted.filter((item) => item.tier === "Primary Government Source" || item.tier === "Official Statistics" || item.tier === "Legislation/Court Record").length,
  };
  const fromVerdict = {
    independent: recorded.filter((item) => item.kind === "independent reporting").length,
    primary: recorded.filter((item) => item.kind === "primary record").length,
  };
  const independent = Math.max(fromRows.independent, fromVerdict.independent);
  const primary = Math.max(fromRows.primary, fromVerdict.primary);
  const reports = independent ? `${independent} accepted independent report${independent === 1 ? "" : "s"}` : "";
  const records = primary ? `${primary} accepted primary record${primary === 1 ? "" : "s"}` : "";
  const line = reports && records ? `${reports} plus ${records}` : reports || records || "No accepted evidence is filed yet.";
  return { independent, primary, line };
}

export function parseSourceLinks(raw: string) {
  const links = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (links.length > 4) return { ok: false as const, reason: "Four links is the limit." };
  if (links.some((link) => !/^https:\/\/\S+$/.test(link))) return { ok: false as const, reason: "Each source has to be an https URL, one per line." };
  return { ok: true as const, links };
}

/** The editor's string is stored and read back unchanged. Hashtags are not removed. */
export function finalPostRecord(text: string, sources: string[]) {
  return {
    version: "M" as const,
    style: "manual" as const,
    content: text,
    suggested_hashtag: null as null,
    generation_metadata: {
      source: "final-post" as const,
      exact: true,
      sources,
      holdReason: "The editor's final post. Publishing is a separate confirmation.",
    },
  };
}

export function readFinalPost(record: { content: string; generation_metadata?: { sources?: unknown; source?: unknown; exact?: unknown } | null }) {
  const meta = record.generation_metadata;
  const exact = meta?.source === "final-post" && meta.exact === true;
  const sources = meta?.sources;
  return {
    exact,
    text: exact ? record.content : "",
    sources: exact && Array.isArray(sources) ? sources.filter((item): item is string => typeof item === "string") : [],
  };
}

export function postsIn(text: string) {
  return text.split(/\n\s*\n/).map((part) => part.trimEnd()).filter((part) => part.trim().length > 0);
}

export function previewPosts(text: string) {
  const posts = text.trim() ? postsIn(text) : [];
  return {
    posts,
    overflow: posts.some((post) => characterCount(post) > POST_LIMIT),
  };
}

/** Inserts a blank line at a word boundary. Every original character remains. */
export function convertToTwoPosts(text: string) {
  const posts = postsIn(text);
  const index = posts.findIndex((post) => characterCount(post) > POST_LIMIT);
  if (index < 0) return null;
  const target = posts[index]!;
  let cut = POST_LIMIT;
  const window = target.slice(0, POST_LIMIT);
  const space = window.lastIndexOf(" ");
  if (space > 40) cut = space;
  const first = target.slice(0, cut).trimEnd();
  const second = target.slice(cut).trimStart();
  const next = posts.slice();
  next.splice(index, 1, first, second);
  return next.join("\n\n");
}

export function publishablePost(text: string) {
  const posts = postsIn(text);
  if (posts.length !== 1) return { ok: false as const, reason: "The current publish gate sends one post. A second post is shown, and it is not sent." };
  if (characterCount(posts[0]!) > POST_LIMIT) return { ok: false as const, reason: `This post is over ${POST_LIMIT} characters. It was not shortened.` };
  if (!posts[0]!.trim()) return { ok: false as const, reason: "The final post is empty." };
  return { ok: true as const, text: posts[0]! };
}

export const reviewChecklist = [
  { id: "wording", label: "Wording reflects the evidence" },
  { id: "unsupported", label: "No unsupported factual statement" },
  { id: "links", label: "Links are correct" },
  { id: "exact", label: "I approve this exact text" },
] as const;

export function reviewComplete(checks: Record<string, boolean>) {
  return reviewChecklist.every((item) => checks[item.id] === true);
}
