import "server-only";
import { editorAccess } from "@/lib/auth/access";

const readGapMs = 20_000;

export async function assertEditorRequest(request: Request) {
  const decision = editorAccess({ sameOrigin: assertEditorPost(request) === null });
  if (!decision.ok) return { status: decision.status, message: decision.message };
  return null;
}

type ReadBucket = { __prngXReadAt?: number };
type PostBucket = { __prngXPosts?: Set<string> };

export function assertEditorPost(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return "This action has to come from the app.";
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return "This action has to come from the app.";
  try {
    if (new URL(origin).host !== host) return "This action has to come from the app.";
  } catch {
    return "This action has to come from the app.";
  }
  return null;
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
