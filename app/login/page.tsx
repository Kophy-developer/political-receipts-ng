"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/editor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setMessage(body.message || "Sign-in did not succeed.");
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/desk");
      router.refresh();
    } catch {
      setMessage("The desk could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mx-auto w-full max-w-md px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Editor</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Sign in</h1>
      <p className="mt-3 text-sm text-ink-soft">The desk is private. A password is checked on the server. Same-origin alone is not enough.</p>
      <label className="mt-6 block text-sm" htmlFor="editor-password">Password</label>
      <input
        id="editor-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-2 h-11 w-full border border-rule bg-paper px-3 text-sm outline-none focus:border-ink"
      />
      <button type="submit" disabled={busy || !password} className="mt-4 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
        {busy ? "Checking…" : "Sign in"}
      </button>
      {message ? <p className="mt-4 text-sm">{message}</p> : null}
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="px-4 py-16 text-sm">Loading sign-in.</p>}>
      <SignInForm />
    </Suspense>
  );
}
