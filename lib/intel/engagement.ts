export const engagementMetrics = ["replies", "likes", "reposts"] as const;

export type EngagementMetric = (typeof engagementMetrics)[number];

export type EngagementSetting = {
  metric: EngagementMetric;
  minimum: number;
};

export const defaultEngagement: EngagementSetting = { metric: "replies", minimum: 20 };

export const engagementMiss = "No posts met your engagement requirement";

export const engagementQueryLimit = 480;

const forbidden = /\bmin_(?:faves|retweets):[0-9]+\b/gi;
const existing = /\bmin_(?:replies|likes|reposts):[0-9]+\b/gi;

export function parseEngagement(input: { metric?: unknown; minimum?: unknown }): { ok: true; setting: EngagementSetting } | { ok: false; message: string } {
  const metric = typeof input.metric === "string" ? input.metric.trim().toLowerCase() : "";
  if (metric === "faves" || metric === "retweets" || metric === "min_faves" || metric === "min_retweets") {
    return { ok: false, message: "min_faves and min_retweets are web-search spellings. This API accepts min_replies, min_likes, or min_reposts." };
  }
  if (metric !== "replies" && metric !== "likes" && metric !== "reposts") {
    return { ok: false, message: "Choose replies, likes, or reposts." };
  }
  const minimum = typeof input.minimum === "number" ? input.minimum : typeof input.minimum === "string" && input.minimum.trim() ? Number(input.minimum) : Number.NaN;
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 1_000_000) {
    return { ok: false, message: "The minimum has to be a whole number from 1 to 1000000." };
  }
  return { ok: true, setting: { metric, minimum } };
}

export function engagementOperator(setting: EngagementSetting) {
  return `min_${setting.metric}:${setting.minimum}`;
}

/** The query X receives. Topic text is kept. The operator is not applied after posts arrive. */
export function withEngagement(topicQuery: string, setting: EngagementSetting): { ok: true; query: string; operator: string } | { ok: false; message: string } {
  const parsed = parseEngagement(setting);
  if (!parsed.ok) return parsed;
  const base = topicQuery.replace(forbidden, " ").replace(existing, " ").replace(/\s+/g, " ").trim();
  if (!base) return { ok: false, message: "The search group has no topic query. No X request was made." };
  const operator = engagementOperator(parsed.setting);
  const query = `${base} ${operator}`;
  if (/\bmin_faves:|\bmin_retweets:/.test(query)) {
    return { ok: false, message: "The X query still contains a web-search operator. No X request was made." };
  }
  if (query.length > engagementQueryLimit) {
    return { ok: false, message: "The completed X query is too long. No X request was made." };
  }
  return { ok: true, query, operator };
}
