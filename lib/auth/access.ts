export function editorAccess(input: { configured: boolean; session: boolean; sameOrigin: boolean }) {
  if (!input.configured) {
    return { ok: false as const, status: 503, message: "Editor sign-in is not configured." };
  }
  if (!input.session) {
    return { ok: false as const, status: 401, message: "Sign in to the desk before changing anything." };
  }
  if (!input.sameOrigin) {
    return { ok: false as const, status: 403, message: "This action has to come from the desk." };
  }
  return { ok: true as const, status: 200, message: "" };
}

/** One confirmation nonce can be claimed once, including on another server. */
export function claimOnce(seen: Set<string>, nonce: string) {
  if (!nonce || seen.has(nonce)) return false;
  seen.add(nonce);
  return true;
}
