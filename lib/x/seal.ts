import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";

function sealKey() {
  const material = [process.env.X_CLIENT_SECRET, process.env.X_API_SECRET, process.env.X_ACCESS_TOKEN_SECRET]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
  if (!material) return null;
  return createHash("sha256").update(`prng-x-seal\n${material}`).digest();
}

export function seal(payload: object) {
  const key = sealKey();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function openSeal<T>(token: string | null | undefined): T | null {
  const key = sealKey();
  if (!key || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function writeCookie(name: string, value: string, path: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const stored = encodeURIComponent(value);
  return `${name}=${stored}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${maxAge}${secure}`;
}
