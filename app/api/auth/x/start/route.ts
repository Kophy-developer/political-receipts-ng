import { createHash, randomBytes } from "crypto";
import { readOauth2 } from "@/lib/x/env";
import { xCallbackUrl, xProductionOrigin, xScopes } from "@/lib/x/public";
import { seal, writeCookie } from "@/lib/x/seal";

function page(title: string, message: string, status: number) {
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
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export async function GET(request: Request) {
  const oauth = readOauth2();
  if (!oauth) return page("X OAuth is not configured", "The server is missing the OAuth client credentials. Nothing was sent to X.", 503);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host !== new URL(xProductionOrigin).host) {
    return page(
      "Start this from production",
      "The X portal is registered to the production callback. Open the production desk and connect from there.",
      400,
    );
  }
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const sealed = seal({ state, verifier, exp: Date.now() + 10 * 60 * 1000 });
  if (!sealed) return page("The desk could not start OAuth", "The server could not seal the sign-in state. Nothing was sent to X.", 503);
  const authorize = new URL("https://x.com/i/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", oauth.clientId);
  authorize.searchParams.set("redirect_uri", xCallbackUrl);
  authorize.searchParams.set("scope", xScopes.join(" "));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": writeCookie("prng_x_oauth", sealed, "/api/auth/x", 600),
      "Cache-Control": "no-store",
    },
  });
}
