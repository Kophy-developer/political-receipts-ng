import { createHash, timingSafeEqual } from "crypto";

/** Compare without leaking which character differed or how long the guess was. */
export function passwordsMatch(expected: string, given: string) {
  if (!expected || !given) return false;
  const left = createHash("sha256").update(`prng-editor\n${expected}`).digest();
  const right = createHash("sha256").update(`prng-editor\n${given}`).digest();
  return timingSafeEqual(left, right);
}
