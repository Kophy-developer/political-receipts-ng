/** Writes must come from this app. There is no editor password. */
export function editorAccess(input: { sameOrigin: boolean }) {
  if (!input.sameOrigin) {
    return { ok: false as const, status: 403, message: "This action has to come from the app." };
  }
  return { ok: true as const, status: 200, message: "" };
}

/** One confirmation nonce can be claimed once, including on another server. */
export function claimOnce(seen: Set<string>, nonce: string) {
  if (!nonce || seen.has(nonce)) return false;
  seen.add(nonce);
  return true;
}
