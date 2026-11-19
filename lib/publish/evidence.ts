import { characterCount } from "@/lib/format";
import { standardPostLimit } from "@/lib/publish/capability";

export function parseHttpsUrl(raw: unknown): { ok: true; url: string } | { ok: false; message: string } {
  if (typeof raw !== "string") return { ok: false, message: "The evidence link is missing." };
  const value = raw.trim();
  if (!value) return { ok: false, message: "Add an https evidence link before publishing." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "The evidence link has to be a full https URL." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "The evidence link has to start with https://" };
  if (url.username || url.password) return { ok: false, message: "The evidence link cannot include a username or password." };
  return { ok: true, url: url.toString() };
}

export function parseOptionalHttpsUrl(raw: unknown): { ok: true; url: string | null } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, url: null };
  if (typeof raw !== "string") return { ok: false, message: "The image link has to be text." };
  const value = raw.trim();
  if (!value) return { ok: true, url: null };
  const parsed = parseHttpsUrl(value);
  if (!parsed.ok) return { ok: false, message: parsed.message.replace("evidence link", "image link") };
  return { ok: true, url: parsed.url };
}

function truncateForLink(text: string, room: number) {
  if (room < 1) return "";
  if (characterCount(text) <= room) return text;
  const chars = Array.from(text);
  let cut = chars.slice(0, room).join("").replace(/\s+\S*$/, "").trimEnd();
  if (!cut) cut = chars.slice(0, Math.max(0, room - 1)).join("").trimEnd();
  return cut.replace(/[.,;:]+$/, "").trimEnd();
}

/** Puts one evidence URL into the approved post without dumping a bibliography. */
export function composeEvidencePost(input: {
  text: string;
  evidenceUrl: string;
  maximum?: number;
}) {
  const maximum = input.maximum ?? standardPostLimit;
  const text = input.text.trim();
  const evidenceUrl = input.evidenceUrl.trim();
  if (!text) return { ok: false as const, message: "Write or keep a draft before publishing." };
  if (!evidenceUrl) return { ok: false as const, message: "Add an https evidence link before publishing." };
  if (text.includes(evidenceUrl)) {
    if (characterCount(text) > maximum) {
      return { ok: false as const, message: `The post must be 1–${maximum} characters with the evidence link included.` };
    }
    return { ok: true as const, text, alreadyPresent: true as const };
  }
  const gap = "\n\n";
  const needed = characterCount(gap) + characterCount(evidenceUrl);
  if (needed >= maximum) {
    return { ok: false as const, message: "That evidence link leaves no room for the post." };
  }
  const room = maximum - needed;
  const body = characterCount(text) <= room ? text : truncateForLink(text, room);
  if (!body) return { ok: false as const, message: "The draft is too long to keep once the evidence link is added." };
  const composed = `${body}${gap}${evidenceUrl}`;
  if (characterCount(composed) > maximum) {
    return { ok: false as const, message: `The post must be 1–${maximum} characters with the evidence link included.` };
  }
  return { ok: true as const, text: composed, alreadyPresent: false as const };
}
