import "server-only";
import { columnMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";

/** Durable single-use publish confirmation. A second instance cannot spend the same nonce. */
export async function claimPublishConfirmation(nonce: string, approvalId: string) {
  if (!nonce || nonce.length > 200) return { ok: false as const, status: 400, message: "The publish confirmation is missing." };
  if (!isUuid(approvalId)) return { ok: false as const, status: 400, message: "The approval is missing." };
  const db = serviceClient();
  if (!db) return { ok: false as const, status: 503, message: "The database is not configured. Nothing was sent to X." };
  const inserted = await db.from("publish_confirmations").insert({ nonce, approval_id: approvalId }).select("nonce").maybeSingle();
  if (inserted.error?.code === "23505") {
    return { ok: false as const, status: 409, message: "This confirmation was already used. Open it again before sending." };
  }
  if (inserted.error && columnMissing(inserted.error.message)) {
    return { ok: false as const, status: 503, message: "Publish confirmation storage is not installed. Nothing was sent to X." };
  }
  if (inserted.error) return { ok: false as const, status: 502, message: scrubDbMessage(inserted.error.message) };
  return { ok: true as const };
}
