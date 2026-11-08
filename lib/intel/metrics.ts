export type MetricValue = number | null;

export type PostMetrics = {
  replies: MetricValue;
  reposts: MetricValue;
  likes: MetricValue;
  quotes: MetricValue;
  bookmarks: MetricValue;
  views: MetricValue;
};

const ceiling = 1_000_000_000;

export function metricValue(value: unknown): MetricValue {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(Math.floor(number), ceiling);
}

function readKey(record: Record<string, unknown> | null, key: string): MetricValue {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return null;
  return metricValue(record[key]);
}

/** X public_metrics. A missing key stays missing. A returned zero stays zero. */
export function metricsFromX(record: Record<string, unknown> | null): PostMetrics {
  return {
    replies: readKey(record, "reply_count"),
    reposts: readKey(record, "retweet_count"),
    likes: readKey(record, "like_count"),
    quotes: readKey(record, "quote_count"),
    bookmarks: readKey(record, "bookmark_count"),
    views: readKey(record, "impression_count"),
  };
}

/** Stored public_metrics. Old rows have no bookmarks key, so bookmarks stay unavailable. */
export function metricsFromStored(value: unknown): PostMetrics {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  return {
    replies: readKey(record, "replies"),
    reposts: readKey(record, "reposts"),
    likes: readKey(record, "likes"),
    quotes: readKey(record, "quotes"),
    bookmarks: readKey(record, "bookmarks"),
    views: readKey(record, "views"),
  };
}

export function metricLabel(value: MetricValue) {
  return value === null ? "Not returned" : String(value);
}

export function knownSum(values: MetricValue[]) {
  if (values.some((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}
