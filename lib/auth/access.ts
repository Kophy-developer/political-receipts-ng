/** Writes must come from this app. There is no editor password. */
export function editorAccess(input: { sameOrigin: boolean }) {
  if (!input.sameOrigin) {
    return { ok: false as const, status: 403, message: "This action has to come from the app." };
  }
  return { ok: true as const, status: 200, message: "" };
}

export function requestFromApp(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin") return true;
  if (site) return false;
  const origin = request.headers.get("origin");
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host");
  if (!origin || origin === "null" || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** One confirmation nonce can be claimed once, including on another server. */
export function claimOnce(seen: Set<string>, nonce: string) {
  if (!nonce || seen.has(nonce)) return false;
  seen.add(nonce);
  return true;
}
