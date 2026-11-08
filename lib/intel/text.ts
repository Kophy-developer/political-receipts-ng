export function decodeEntities(input: string) {
  return input.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function sanitizeText(input: string, max = 2000) {
  return decodeEntities(input)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const genericWords = new Set([
  "nigeria",
  "nigerian",
  "naira",
  "election",
  "elections",
  "2027",
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "have",
  "has",
  "was",
  "are",
  "were",
  "will",
  "you",
  "your",
  "our",
  "not",
  "but",
  "they",
  "them",
  "his",
  "her",
  "who",
  "what",
  "when",
  "into",
  "over",
  "after",
  "before",
  "about",
  "just",
  "all",
  "can",
  "its",
  "amp",
  "http",
  "https",
]);

export function plainPost(text: string) {
  return sanitizeText(text)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string) {
  if (word.length <= 4) return word;
  return word.replace(/(ing|ed|es|s)$/, "");
}

export function distinctiveTokens(text: string, skip: Set<string> = new Set()) {
  return plainPost(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((word) => word.length > 2 && !genericWords.has(word) && !skip.has(word));
}

export function cleanUsername(value: string | null | undefined) {
  if (!value) return null;
  const clean = value.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
  return clean || null;
}

export function publicPostUrl(id: string, username: string | null) {
  if (!/^\d{1,25}$/.test(id)) return null;
  if (username) return `https://x.com/${username}/status/${id}`;
  return `https://x.com/i/status/${id}`;
}

export function engagementOf(metrics: { replies?: number | null; reposts?: number | null; likes?: number | null; quotes?: number | null }) {
  return [metrics.replies, metrics.reposts, metrics.likes, metrics.quotes].reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
}

const nonClaim =
  /\b(i|we)\s+(love|hate|prefer|support|endorse)\b|\bvote\s+(for|him|her|them)\b|\b(will|gonna|going to)\s+win\b|\b(lol|lmao)\b/i;

const recordVerb =
  /\b(spent|spend|spending|voted|vote|fell|fall|fallen|rose|rise|risen|changed|change|announced|allocated|approved|signed|passed|cost|owes|debt|inflation|budget|deadline|registered)\b/i;

export function looksCheckable(claim: string) {
  if (claim.length < 24 || claim.length > 400) return false;
  const hasFigure = /\d/.test(claim);
  if (nonClaim.test(claim) && !hasFigure) return false;
  if (/\b(will win|going to win|i predict)\b/i.test(claim)) return false;
  return hasFigure || recordVerb.test(claim);
}

export function groundedClaim(claim: string, post: string) {
  const postFold = post.toLowerCase();
  const quotes = [...claim.matchAll(/[“"]([^”"]{8,})[”"]/g)].map((match) => match[1].toLowerCase());
  if (quotes.some((quote) => !postFold.includes(quote))) return false;
  const plainPost = post.replace(/,/g, "");
  const numbers = claim.match(/\d[\d,.]*/g) ?? [];
  return numbers.every((number) => {
    const plain = number.replace(/,/g, "");
    return post.includes(number) || plainPost.includes(plain);
  });
}

export function cleanModelNote(note: string, post: string) {
  const text = sanitizeText(note, 400);
  if (!text) return null;
  if (/my knowledge|i recall|as an ai|training data|i know that|according to (me|gemini)/i.test(text)) return null;
  const urls = text.match(/https?:\/\/\S+/gi) ?? [];
  if (urls.some((url) => !post.includes(url))) return null;
  return text;
}

export function groundedSpeaker(speaker: string, post: string, displayName: string | null, username: string | null) {
  const name = sanitizeText(speaker, 80);
  if (!name) return null;
  const haystack = `${post} ${displayName ?? ""} ${username ?? ""}`.toLowerCase();
  return haystack.includes(name.toLowerCase()) ? name : null;
}
