import "server-only";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";

const banned = /token|secret|password|authorization|ciphertext|cookie|bearer/i;

export type DeskAction =
  | "claim created"
  | "evidence added"
  | "draft generated"
  | "draft edited"
  | "review completed"
  | "approval created"
  | "approval invalidated"
  | "publish attempted"
  | "publish succeeded"
  | "publish failed"
  | "X connection changed"
  | "intelligence scan"
  | "claim dismissed"
  | "claim opened"
  | "posts reprocessed"
  | "evidence accepted"
  | "evidence rejected"
  | "evidence revised"
  | "verdict revised"
  | "verdict recorded"
  | "angle saved"
  | "more research requested"
  | "opportunity filed"
  | "opportunity decided"
  | "research sent";

function safeDetail(detail: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (banned.test(key)) continue;
    if (typeof value === "string") {
      if (banned.test(value) || value.length > 180) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}

export async function recordEvent(input: {
  action: DeskAction;
  actor: string;
  subjectType?: string;
  subjectId?: string;
  detail?: Record<string, unknown>;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const { error } = await db.from("system_events").insert({
    action: input.action,
    actor: input.actor.slice(0, 80),
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    detail: safeDetail(input.detail ?? {}),
  });
  if (error) return { ok: false as const, message: scrubDbMessage(error.message) };
  return { ok: true as const };
}
