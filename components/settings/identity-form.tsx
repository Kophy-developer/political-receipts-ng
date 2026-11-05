"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditorIdentity } from "@/lib/identity";
import { Input } from "@/components/ui/input";

export function IdentityForm({ identity }: { identity: EditorIdentity }) {
  const router = useRouter();
  const [name, setName] = useState(identity.name);
  const [role, setRole] = useState(identity.role);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/desk/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, role }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setNotice(body.message || (body.ok ? "Editor identity saved. The connected X account was not changed." : "The identity was not saved."));
      if (body.ok) router.refresh();
    } catch {
      setNotice("The identity was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <p className="text-sm leading-relaxed text-ink-soft">
        This is the name inside the desk. It is not taken from the connected X account, and saving it does not change that account.
      </p>
      <label className="mt-4 block text-sm" htmlFor="editor-name">Display name</label>
      <Input id="editor-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1" autoComplete="off" />
      <label className="mt-4 block text-sm" htmlFor="editor-role">Role or title, optional</label>
      <Input id="editor-role" value={role} onChange={(event) => setRole(event.target.value)} className="mt-1" autoComplete="off" />
      <button type="button" onClick={() => void save()} disabled={busy} className="mt-4 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
        {busy ? "Saving…" : "Save identity"}
      </button>
      {notice ? <p className="mt-3 text-sm">{notice}</p> : null}
    </div>
  );
}
