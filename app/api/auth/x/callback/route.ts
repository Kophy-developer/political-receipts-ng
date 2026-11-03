import { saveOauth2Connection } from "@/lib/db/connections";
import { readOauth2 } from "@/lib/x/env";
import { identifyBearer } from "@/lib/x/account";
import { xCallbackUrl } from "@/lib/x/public";
import { scrubPublicMessage } from "@/lib/x/scrub";
import { openSeal, readCookie, writeCookie } from "@/lib/x/seal";

type Pending = { state: string; verifier: string; exp: number };

function finish(path: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: path,
      "Set-Cookie": writeCookie("prng_x_oauth", "", "/api/auth/x", 0),
      "Cache-Control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

function page(title: string, message: string) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <style>
      body { margin: 0; background: #efeae2; color: #1c1b18; font-family: Georgia, serif; }
      main { max-width: 38rem; margin: 0 auto; padding: 4.5rem 1.5rem; }
      p.kicker { font-family: ui-monospace, monospace; letter-spacing: 0.16em; text-transform: uppercase; font-size: 11px; color: #9f2d20; }
      h1 { font-weight: 500; font-size: 2.2rem; line-height: 1.1; margin: 0.8rem 0 1rem; }
      p, a { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <main>
      <p class="kicker">Political Receipts NG</p>
      <h1>${title}</h1>
      <p>${message}</p>
      <p><a href="/settings">Return to settings</a></p>
    </main>
  </body>
</html>`;
  return new Response(html, {
    status: 400,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "Set-Cookie": writeCookie("prng_x_oauth", "", "/api/auth/x", 0),
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) return finish("/settings?x=denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return page("The callback was incomplete", "X did not return a usable authorisation. No token was stored.");
  const pending = openSeal<Pending>(readCookie(request.headers.get("cookie"), "prng_x_oauth"));
  if (!pending || pending.exp < Date.now() || pending.state !== state) {
    return finish("/settings?x=state");
  }
  const oauth = readOauth2();
  if (!oauth) return finish("/settings?x=config");
  let tokenResponse: Response;
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: xCallbackUrl,
      code_verifier: pending.verifier,
    });
    tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });
  } catch {
    return finish("/settings?x=exchange");
  }
  if (!tokenResponse.ok) return finish("/settings?x=exchange");
  let accessToken = "";
  let refreshToken = "";
  let expiresIn = 0;
  try {
    const payload = (await tokenResponse.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) return finish("/settings?x=exchange");
    if (typeof payload.refresh_token !== "string" || !payload.refresh_token) return finish("/settings?x=exchange");
    accessToken = payload.access_token;
    refreshToken = payload.refresh_token;
    expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 0;
  } catch {
    return finish("/settings?x=exchange");
  }
  const identified = await identifyBearer(accessToken);
  if (!identified.ok) {
    accessToken = "";
    refreshToken = "";
    return finish("/settings?x=identity");
  }
  const saved = await saveOauth2Connection({
    xUserId: identified.account.id,
    username: identified.account.username,
    displayName: identified.account.name,
    accessToken,
    refreshToken,
    expiresIn,
  });
  accessToken = "";
  refreshToken = "";
  if (!saved.ok && saved.reason === "encrypt") return finish("/settings?x=encrypt");
  if (!saved.ok) return finish("/settings?x=store");
  const handle = encodeURIComponent(identified.account.username);
  return finish(`/settings?x=handshake&handle=${handle}`);
}

export function POST() {
  return Response.json(
    { ok: false, message: scrubPublicMessage("This callback only accepts the X redirect.") },
    { status: 405, headers: { "cache-control": "no-store", Allow: "GET" } },
  );
}
