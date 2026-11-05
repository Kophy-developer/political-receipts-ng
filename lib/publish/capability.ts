import { POST_LIMIT } from "@/lib/format";

/**
 * What this desk can actually send.
 * Long-post support stays unknown until a verified publisher check exists.
 * The documented 25,000-character ceiling is not treated as our limit.
 */
export const standardPostLimit = POST_LIMIT;

export const documentedLongPostLimit = 25_000;

export type LongPostSupport = "unknown" | "yes" | "no";

export const publishingCapability = {
  standardPostLimit,
  longPostLimit: null as number | null,
  longPostSupported: "unknown" as LongPostSupport,
  threadComposition: true,
  threadPublishing: false,
  mediaPublishing: false,
  singlePostPublishing: true,
};

export const longPostUnknownCopy =
  "Your X subscription may support longer posts, but PRNG has not verified API publishing support yet.";

export function currentPublishLimit(capability = publishingCapability) {
  if (capability.longPostSupported === "yes" && capability.longPostLimit) return capability.longPostLimit;
  return capability.standardPostLimit;
}
