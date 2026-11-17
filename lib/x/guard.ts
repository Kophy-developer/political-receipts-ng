import "server-only";
import { editorAccess, requestFromApp } from "@/lib/auth/access";

const readGapMs = 20_000;

export async function assertEditorRequest(request: Request) {
  const decision = editorAccess({ sameOrigin: requestFromApp(request) });
  if (!decision.ok) return { status: decision.status, message: decision.message };
  return null;
}

type ReadBucket = { __prngXReadAt?: number };
type PostBucket = { __prngXPosts?: Set<string> };

export function assertEditorPost(request: Request) {
  if (requestFromApp(request)) return null;
  return "This action has to come from the app.";
}

export function reserveAccountRead(lastCheck: number | null) {
  const now = Date.now();
  if (lastCheck && now - lastCheck < readGapMs) {
    return "A connection check just ran. Wait a moment before calling X again.";
  }
  const bucket = globalThis as typeof globalThis & ReadBucket;
  if (bucket.__prngXReadAt && now - bucket.__prngXReadAt < readGapMs) {
    return "A connection check just ran. Wait a moment before calling X again.";
  }
  bucket.__prngXReadAt = now;
  return null;
}

export function reservePostNonce(nonce: string) {
  const bucket = globalThis as typeof globalThis & PostBucket;
  const seen = bucket.__prngXPosts ?? new Set<string>();
  bucket.__prngXPosts = seen;
  if (seen.has(nonce)) return false;
  seen.add(nonce);
  if (seen.size > 200) {
    const first = seen.values().next().value;
    if (first) seen.delete(first);
  }
  return true;
}
