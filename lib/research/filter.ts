import type { SearchStage } from "@/lib/research/types";

const socialDomains = ["instagram.com", "facebook.com", "fb.com", "fb.watch", "x.com", "twitter.com", "t.co", "tiktok.com", "youtube.com", "youtu.be"];

export function hostname(raw: string) {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function hostInDomains(host: string, domains: string[]) {
  const name = host.toLowerCase().replace(/^www\./, "");
  return domains.some((domain) => {
    const item = domain.toLowerCase().replace(/^www\./, "");
    return name === item || name.endsWith(`.${item}`);
  });
}

export function isSocialHost(host: string) {
  const name = host.toLowerCase().replace(/^www\./, "");
  return socialDomains.some((domain) => name === domain || name.endsWith(`.${domain}`));
}

export function classifyResult(url: string, stage: SearchStage, domains: string[]) {
  const host = hostname(url);
  if (!host || !url.startsWith("https://")) {
    return { keep: false, social: false, reason: "The result had no public https address." };
  }
  const social = isSocialHost(host);
  if (stage === "context") return { keep: true, social, reason: null as string | null };
  if (social) {
    const which = stage === "primary" ? "primary source" : "independent source";
    return { keep: false, social: true, reason: `${host} is a social page. It is not a ${which}.` };
  }
  if (domains.length === 0) return { keep: false, social: false, reason: "This stage has no target domain configured." };
  if (!hostInDomains(host, domains)) return { keep: false, social: false, reason: `${host} is outside ${domains.join(", ")}.` };
  return { keep: true, social: false, reason: null as string | null };
}

export function partitionHits<T extends { url: string }>(hits: T[], stage: SearchStage, domains: string[]) {
  const eligible: T[] = [];
  const rejected: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    const decision = classifyResult(hit.url, stage, domains);
    if (!decision.keep) {
      rejected.push({ url: hit.url, reason: decision.reason || "Outside this stage." });
      continue;
    }
    eligible.push(hit);
  }
  const ordered = stage === "context"
    ? [...eligible].sort((left, right) => Number(isSocialHost(hostname(left.url) || "")) - Number(isSocialHost(hostname(right.url) || "")))
    : eligible;
  return { eligible: ordered, rejected, inDomain: ordered.length, outOfDomain: rejected.length };
}

export function selectForRetrieval<T extends { url: string }>(hits: T[], stage: SearchStage, domains: string[], maxDocuments: number) {
  const split = partitionHits(hits, stage, domains);
  return { ...split, eligible: split.eligible.slice(0, Math.max(0, maxDocuments)) };
}
