import "server-only";
import { scrubDbMessage, serviceClient } from "@/lib/db/client";
import { cleanEditorName, cleanEditorRole, defaultEditorIdentity, type EditorIdentity } from "@/lib/identity";

export async function loadEditorIdentity(): Promise<EditorIdentity> {
  const db = serviceClient();
  if (!db) return defaultEditorIdentity;
  const { data, error } = await db
    .from("editor_profiles")
    .select("display_name, role")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return defaultEditorIdentity;
  const row = data[0] as { display_name?: unknown; role?: unknown };
  const stored = typeof row.display_name === "string" ? row.display_name : "";
  const parsed = cleanEditorName(stored);
  if (!parsed.ok) return defaultEditorIdentity;
  const role = typeof row.role === "string" ? row.role.trim() : "";
  return { name: parsed.name, role, configured: true };
}

export async function editorActor() {
  return (await loadEditorIdentity()).name;
}

export async function saveEditorIdentity(input: { name: string; role: string }) {
  const name = cleanEditorName(input.name);
  if (!name.ok) return { ok: false as const, message: name.reason };
  const role = cleanEditorRole(input.role);
  if (!role.ok) return { ok: false as const, message: role.reason };
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const existing = await db.from("editor_profiles").select("id").order("updated_at", { ascending: false }).limit(1);
  if (existing.error) return { ok: false as const, message: scrubDbMessage(existing.error.message) };
  const fields = { display_name: name.name, role: role.role, status: "active" as const };
  if (existing.data?.[0]?.id) {
    const updated = await db.from("editor_profiles").update(fields).eq("id", existing.data[0].id).select("display_name, role").maybeSingle();
    if (updated.error || !updated.data) return { ok: false as const, message: scrubDbMessage(updated.error?.message || "identity") };
    return { ok: true as const, name: updated.data.display_name as string, role: (updated.data.role as string) ?? "" };
  }
  const inserted = await db.from("editor_profiles").insert(fields).select("display_name, role").single();
  if (inserted.error || !inserted.data) return { ok: false as const, message: scrubDbMessage(inserted.error?.message || "identity") };
  return { ok: true as const, name: inserted.data.display_name as string, role: (inserted.data.role as string) ?? "" };
}
