/** Editor session tokens. Web Crypto so the check runs in middleware and in route handlers. */

const encoder = new TextEncoder();

function bytes(value: string) {
  return encoder.encode(value);
}

function base64url(data: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(data)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(secret: string, expiresAt: number) {
  const body = `v1.${expiresAt}`;
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), bytes(body));
  return `${body}.${base64url(mac)}`;
}

export async function sessionValid(secret: string, token: string | null | undefined, now: number) {
  if (!secret || !token) return false;
  const [version, expText, mac] = token.split(".");
  if (version !== "v1" || !expText || !mac) return false;
  const expiresAt = Number(expText);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64url(mac), bytes(`v1.${expText}`));
  } catch {
    return false;
  }
}

export const sessionCookie = "prng_editor";
export const sessionTtlMs = 12 * 60 * 60 * 1000;
