import { createHash } from "crypto";

export function contentHash(text: string) {
  return createHash("sha256").update(text).digest("base64url");
}
