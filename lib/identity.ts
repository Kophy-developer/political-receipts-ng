/** Internal desk identity. This is not the connected X account. */
export const defaultEditorName = "PRNG Admin";

export type EditorIdentity = {
  name: string;
  role: string;
  configured: boolean;
};

export const defaultEditorIdentity: EditorIdentity = {
  name: defaultEditorName,
  role: "",
  configured: false,
};

export function editorInitials(name: string) {
  if (name.trim() === defaultEditorName) return "PR";
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "PR";
}

export function cleanEditorName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false as const, reason: "Enter a display name." };
  if (name.length > 60) return { ok: false as const, reason: "The display name is too long." };
  if (/[\r\n]/.test(value)) return { ok: false as const, reason: "The display name has to be one line." };
  return { ok: true as const, name };
}

export function cleanEditorRole(value: string) {
  const role = value.trim().replace(/\s+/g, " ");
  if (role.length > 80) return { ok: false as const, reason: "The role is too long." };
  return { ok: true as const, role };
}
