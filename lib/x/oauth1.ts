import "server-only";
import { createHmac, randomBytes } from "crypto";
import { readOauth1 } from "@/lib/x/env";
import { scrubPublicMessage } from "@/lib/x/scrub";

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function authorizationHeader(method: string, endpoint: string) {
  const creds = readOauth1();
  if (!creds) return null;
  const target = new URL(endpoint);
  const collected: Record<string, string> = {};
  target.searchParams.forEach((value, key) => {
    collected[key] = value;
  });
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const pairs = Object.keys({ ...collected, ...oauth })
    .sort()
    .map((key) => `${encode(key)}=${encode(collected[key] ?? oauth[key])}`);
  const baseUrl = `${target.origin}${target.pathname}`;
  const base = [method.toUpperCase(), encode(baseUrl), encode(pairs.join("&"))].join("&");
  const signingKey = `${encode(creds.apiSecret)}&${encode(creds.accessSecret)}`;
  oauth.oauth_signature = createHmac("sha1", signingKey).update(base).digest("base64");
  const header = Object.keys(oauth)
    .sort()
    .map((key) => `${encode(key)}="${encode(oauth[key])}"`)
    .join(", ");
  return `OAuth ${header}`;
}

export async function xUserRequest(method: "GET" | "POST", url: string, body?: string) {
  const authorization = authorizationHeader(method, url);
  if (!authorization) {
    return { ok: false as const, status: 503, message: "X API credentials are not configured on the server." };
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });
  } catch {
    return { ok: false as const, status: 502, message: "The desk could not reach X." };
  }
  if (!response.ok) {
    let message = `X returned ${response.status}.`;
    try {
      const data = (await response.json()) as { title?: string; detail?: string };
      message = scrubPublicMessage(data.detail || data.title || message);
    } catch {
      message = scrubPublicMessage(message);
    }
    return { ok: false as const, status: response.status, message };
  }
  try {
    return { ok: true as const, data: await response.json() };
  } catch {
    return { ok: false as const, status: 502, message: "X returned a response the desk could not read." };
  }
}
