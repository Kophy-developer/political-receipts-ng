export function sanitizeText(input: string, max = 2000) {
  return input
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
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

export function engagementOf(metrics: { replies?: number; reposts?: number; likes?: number; quotes?: number }) {
  return (metrics.replies ?? 0) + (metrics.reposts ?? 0) + (metrics.likes ?? 0) + (metrics.quotes ?? 0);
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

export function clusterKey(groupSlug: string, post: { conversationId: string | null; text: string; matchedTerm: string }) {
  if (post.conversationId && /^\d{1,25}$/.test(post.conversationId)) {
    return `${groupSlug}:thread:${post.conversationId}`.slice(0, 160);
  }
  const numbers = (post.text.match(/\d[\d,.]{0,16}/g) ?? []).slice(0, 3).join("-");
  const term = (post.matchedTerm || "topic").slice(0, 60);
  return `${groupSlug}:${term}:${numbers}`.slice(0, 160);
}
