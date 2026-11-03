import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function keyBytes() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

export function encryptionReady() {
  return keyBytes() !== null;
}

export function encryptSecret(plain: string) {
  const key = keyBytes();
  if (!key || !plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(payload: string) {
  const key = keyBytes();
  if (!key) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return plain || null;
  } catch {
    return null;
  }
}
