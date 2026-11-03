import "server-only";
import { randomBytes } from "crypto";
import { openSeal, readCookie, seal, writeCookie } from "@/lib/x/seal";
import { textHash, validateApprovedPost } from "@/lib/x/publish";

const cookieName = "prng_x_intent";
const cookiePath = "/api/x";

type Ticket = { nonce: string; hash: string; exp: number };

export function issueTicket(input: { text?: unknown; claimId?: unknown; checks?: unknown }) {
  const problem = validateApprovedPost(input, false);
  if (problem) return { ok: false as const, message: problem };
  const nonce = randomBytes(18).toString("base64url");
  const sealed = seal({
    nonce,
    hash: textHash(input.claimId as string, input.text as string),
    exp: Date.now() + 10 * 60 * 1000,
  } satisfies Ticket);
  if (!sealed) return { ok: false as const, message: "The server cannot seal a publish ticket." };
  return { ok: true as const, cookie: writeCookie(cookieName, sealed, cookiePath, 600) };
}

export function takeTicket(request: Request, claimId: string, text: string) {
  const sealed = readCookie(request.headers.get("cookie"), cookieName);
  const ticket = openSeal<Ticket>(sealed);
  const clear = writeCookie(cookieName, "", cookiePath, 0);
  if (!ticket || ticket.exp < Date.now() || ticket.hash !== textHash(claimId, text)) {
    return { ok: false as const, message: "The publish ticket is missing or does not match this text. Open the confirmation again.", clear };
  }
  return { ok: true as const, nonce: ticket.nonce, clear };
}
