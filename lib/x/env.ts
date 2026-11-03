import "server-only";

function present(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function credentialFlags() {
  const oauth2 = present("X_CLIENT_ID") && present("X_CLIENT_SECRET");
  const oauth1 =
    present("X_API_KEY") &&
    present("X_API_SECRET") &&
    present("X_ACCESS_TOKEN") &&
    present("X_ACCESS_TOKEN_SECRET");
  return {
    oauth2,
    oauth1,
    configured: oauth2 && oauth1,
  };
}

export function readOauth1() {
  const apiKey = process.env.X_API_KEY?.trim();
  const apiSecret = process.env.X_API_SECRET?.trim();
  const accessToken = process.env.X_ACCESS_TOKEN?.trim();
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

export function readOauth2() {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
