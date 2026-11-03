const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>X callback · Political Receipts NG</title>
    <style>
      body { margin: 0; background: #efeae2; color: #1c1b18; font-family: Georgia, serif; }
      main { max-width: 38rem; margin: 0 auto; padding: 4.5rem 1.5rem; }
      p.kicker { font-family: ui-monospace, monospace; letter-spacing: 0.16em; text-transform: uppercase; font-size: 11px; color: #9f2d20; }
      h1 { font-weight: 500; font-size: 2.4rem; line-height: 1.1; margin: 0.8rem 0 1rem; }
      p { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <main>
      <p class="kicker">Political Receipts NG</p>
      <h1>X account connection is not configured.</h1>
      <p>This address is reserved for the future OAuth callback. It does not read authorisation codes, does not store tokens, and does not publish anything.</p>
      <p><a href="/settings">Return to settings</a></p>
    </main>
  </body>
</html>`;

export function GET() {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export function POST() {
  return Response.json(
    {
      ok: false,
      connected: false,
      message:
        "X authentication is not configured. This callback does not exchange codes or store tokens.",
    },
    {
      status: 501,
      headers: { "cache-control": "no-store" },
    },
  );
}
