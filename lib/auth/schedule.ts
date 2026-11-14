function sameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function scheduleSecretConfigured() {
  return Boolean(process.env.CRON_SECRET?.trim());
}

export function assertScheduleRequest(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const header = request.headers.get("authorization")?.trim() || "";
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const alt = request.headers.get("x-cron-secret")?.trim() || "";
    if (bearer === expected || alt === expected) return null;
  }
  if (sameOrigin(request)) return null;
  if (!expected) {
    return { status: 503, message: "Schedule runs need CRON_SECRET on the server, or a same-origin request from the app." };
  }
  return { status: 401, message: "This schedule call was refused." };
}
