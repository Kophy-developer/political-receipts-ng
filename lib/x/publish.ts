import "server-only";
import { createHash } from "crypto";
import { textFits, uncheckedCapability, type PublishCapability } from "@/lib/publish/capability";
import { postCreateBody } from "@/lib/publish/payload";
import { checklist } from "@/lib/system";
import { isUuid } from "@/lib/db/labels";
import { xUserRequest } from "@/lib/x/oauth1";

const tweetsUrl = "https://api.twitter.com/2/tweets";

export function textHash(approvalId: string, text: string) {
  return createHash("sha256").update(`${approvalId}\n${text}`).digest("base64url");
}

export function validatePublishRequest(
  input: { text?: unknown; claimId?: unknown; draftId?: unknown; checks?: unknown; confirm?: unknown; approvalId?: unknown },
  requireConfirm = true,
  capability: PublishCapability = uncheckedCapability,
) {
  if (requireConfirm && input.confirm !== true) return "The post needs an explicit final confirmation.";
  if (typeof input.claimId !== "string" || !isUuid(input.claimId)) return "The claim id is not one this desk can publish.";
  if (typeof input.draftId !== "string" || !isUuid(input.draftId)) return "The draft id is not one this desk can publish.";
  if (requireConfirm && (typeof input.approvalId !== "string" || !isUuid(input.approvalId))) return "The approval is missing.";
  if (typeof input.text !== "string") return "The approved text is missing.";
  const fit = textFits(input.text, capability);
  if (!fit.ok) return fit.reason;
  if (!input.checks || typeof input.checks !== "object") return "The editorial checklist is incomplete.";
  const checks = input.checks as Record<string, unknown>;
  if (!checklist.every((item) => checks[item.id] === true)) return "Every checklist line has to be confirmed on the server.";
  return null;
}

export async function publishApprovedPost(text: string) {
  const result = await xUserRequest("POST", tweetsUrl, JSON.stringify(postCreateBody(text)));
  if (!result.ok) return result;
  const id = (result.data as { data?: { id?: unknown } }).data?.id;
  if (typeof id !== "string" || !/^\d+$/.test(id)) {
    return { ok: false as const, status: 502, message: "X did not return a post id." };
  }
  return { ok: true as const, id, url: `https://x.com/i/web/status/${id}` };
}
