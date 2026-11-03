import type { DeskMode, RecordOrigin } from "@/lib/desk/types";

export function deskMode(ok: boolean, reason: string | undefined, origins: RecordOrigin[]): DeskMode {
  if (!ok && reason === "unconfigured") return "unconfigured";
  if (!ok) return "unreachable";
  if (origins.length === 0) return "empty";
  const demo = origins.some((origin) => origin === "demo");
  const live = origins.some((origin) => origin === "live");
  if (demo && live) return "mixed";
  return demo ? "demo" : "live";
}
