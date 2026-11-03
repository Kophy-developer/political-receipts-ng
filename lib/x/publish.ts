import "server-only";
import { createHash } from "crypto";
import { packageFor } from "@/lib/drafts";
import { characterCount, POST_LIMIT } from "@/lib/format";
import { checklist } from "@/lib/system";
import { xUserRequest } from "@/lib/x/oauth1";

const tweetsUrl = "https://api.twitter.com/2/tweets";

export function textHash(claimId: string, text: string) {
  return createHash("sha256").update(`${claimId}\n${text}`).digest("base64url");
}

export function validateApprovedPost(
  input: { text?: unknown; claimId?: unknown; checks?: unknown; confirm?: unknown },
  requireConfirm = true,
) {
  if (requireConfirm && input.confirm !== true) return "The post needs an explicit final confirmation.";
  if (typeof input.claimId !== "string" || !/^clm-\d{4}$/.test(input.claimId)) return "The claim id is not one this desk can publish.";
  const pack = packageFor(input.claimId);
  if (!pack?.ready) return "This claim is not cleared for publishing.";
  if (typeof input.text !== "string") return "The approved text is missing.";
  const count = characterCount(input.text);
  if (count < 1 || count > POST_LIMIT) return `The post must be 1–${POST_LIMIT} characters.`;
  if (!input.checks || typeof input.checks !== "object") return "The editorial checklist is incomplete.";
  const checks = input.checks as Record<string, unknown>;
  if (!checklist.every((item) => checks[item.id] === true)) return "Every checklist line has to be confirmed on the server.";
  return null;
}

export async function publishApprovedPost(text: string) {
  const result = await xUserRequest("POST", tweetsUrl, JSON.stringify({ text }));
  if (!result.ok) return result;
  const id = (result.data as { data?: { id?: unknown } }).data?.id;
  if (typeof id !== "string" || !/^\d+$/.test(id)) {
    return { ok: false as const, status: 502, message: "X did not return a post id." };
  }
  return { ok: true as const, id, url: `https://x.com/i/web/status/${id}` };
}
