import "server-only";
import { serviceClient, scrubDbMessage } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";
import { recordEvent } from "@/lib/db/events";
import { packetsFromPosts, type StoredAssessmentPost } from "@/lib/editorial/packet";
import { planSavedUnderstandingRecovery, recoveredUnderstandingAttemptId, recoveredUnderstandingScanId } from "@/lib/editorial/recover";

export async function savedUnderstandingRecoveryAvailable() {
  const db = serviceClient();
  if (!db) return false;
  const attempt = await db.from("ai_attempts").select("id, response").eq("id", recoveredUnderstandingAttemptId).maybeSingle();
  const response = attempt.data?.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) return false;
  const body = response as Record<string, unknown>;
  return body.kind === "conversation-understand-v1-rejected" && body.truncated !== true && Boolean(body.parsed);
}

export async function recoverSavedUnderstanding() {
  const empty = {
    ok: false as const,
    recoverable: false as const,
    idempotent: false as const,
    xRequests: 0 as const,
    modelCalls: 0 as const,
    researchCalls: 0 as const,
    posted: false as const,
    message: "The stored understanding could not be recovered. No model request was made.",
  };
  const db = serviceClient();
  if (!db) return { ...empty, message: "The database is not configured. No model request was made." };
  const attempt = await db
    .from("ai_attempts")
    .select("id, response")
    .eq("id", recoveredUnderstandingAttemptId)
    .maybeSingle();
  if (attempt.error || !attempt.data) {
    return { ...empty, message: "The stored Groq attempt could not be read. The redacted fixture was not used. No model request was made." };
  }
  const response = attempt.data.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { ...empty, message: "The stored attempt has no parsed response. No model request was made." };
  }
  const body = response as Record<string, unknown>;
  if (body.kind !== "conversation-understand-v1-rejected") {
    return { ...empty, message: "The stored attempt is not the rejected understanding response. No model request was made." };
  }
  const posts = await db
    .from("x_posts")
    .select("text, username, conversation_id, posted_at, referenced, content_pillar")
    .eq("scan_id", recoveredUnderstandingScanId)
    .order("posted_at", { ascending: true });
  if (posts.error || !posts.data) {
    return { ...empty, message: "The stored posts for that scan could not be read. No model request was made." };
  }
  const stored: StoredAssessmentPost[] = [];
  for (const row of posts.data) {
    const conversationId = String(row.conversation_id ?? "");
    if (!isUuid(conversationId)) continue;
    stored.push({
      text: typeof row.text === "string" ? row.text : null,
      username: typeof row.username === "string" ? row.username : null,
      postedAt: typeof row.posted_at === "string" ? row.posted_at : null,
      conversationId,
      referenced: "referenced" in row ? row.referenced : undefined,
      contentPillar: "content_pillar" in row && typeof row.content_pillar === "string" ? row.content_pillar : null,
    });
  }
  const packets = packetsFromPosts(stored).filter((packet) => packet.posts.some((post) => post.text.trim().length > 0));
  const plan = planSavedUnderstandingRecovery({
    attemptId: recoveredUnderstandingAttemptId,
    scanId: recoveredUnderstandingScanId,
    parsed: body.parsed,
    truncated: body.truncated === true,
    packets,
  });
  if (!plan.ok) return { ...empty, message: plan.message };
  const saved = await db.rpc("save_recovered_understanding", {
    p_attempt_id: recoveredUnderstandingAttemptId,
    p_scan_id: recoveredUnderstandingScanId,
    p_rows: plan.rows.map((row) => ({
      conversation_id: row.conversationId,
      assessment: row.assessment,
      opportunity: row.opportunity,
    })),
  });
  if (saved.error) {
    return { ...empty, recoverable: true, message: `${scrubDbMessage(saved.error.message)} No model request was made.` };
  }
  const result = saved.data as { idempotent?: boolean; saved?: number } | null;
  if (result?.idempotent) {
    return {
      ok: true as const,
      recoverable: true as const,
      idempotent: true as const,
      xRequests: 0 as const,
      modelCalls: 0 as const,
      researchCalls: 0 as const,
      posted: false as const,
      message: "This understanding was already recovered. No new records were written. No X request, model request, research call, or post was made.",
    };
  }
  await recordEvent({
    action: "opportunity filed",
    actor: "desk",
    subjectType: "scan",
    subjectId: recoveredUnderstandingScanId,
    detail: { source: "recovered-understanding", saved: result?.saved ?? plan.rows.length, xRequests: 0, modelCalls: 0, researchCalls: 0 },
  });
  return {
    ok: true as const,
    recoverable: true as const,
    idempotent: false as const,
    xRequests: 0 as const,
    modelCalls: 0 as const,
    researchCalls: 0 as const,
    posted: false as const,
    message: plan.message,
  };
}
