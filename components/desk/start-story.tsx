"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function StartStory({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [phase, setPhase] = useState<"idle" | "confirm" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send(action: "preview" | "start") {
    if (busy.current) return;
    busy.current = true;
    setPhase(action === "preview" ? "confirm" : "working");
    if (action === "start") setMessage("Starting the existing development workflow. This page stays open.");
    try {
      const response = await fetch("/api/desk/develop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message || "The desk could not read that step. Nothing new was called.");
      setPhase(action === "start" ? "done" : "confirm");
      if (action === "start") router.refresh();
    } catch {
      setPhase("idle");
      setMessage("The desk could not reach the server. This story is unchanged.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="border border-ink px-4 py-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase">Next action</p>
      <p className="mt-2 text-sm leading-relaxed">The preview shows the searches and model requests. Confirming runs the existing development workflow. Nothing is published, and a second click does not start a second job.</p>
      <button type="button" disabled={phase === "working"} onClick={() => void send("preview")} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50">
        {phase === "working" ? "Working…" : label}
      </button>
      {message ? <p className="mt-3 text-sm leading-relaxed">{message}</p> : null}
      {phase === "confirm" ? (
        <button type="button" onClick={() => void send("start")} className="mt-3 inline-flex h-11 items-center border border-ink px-3 text-sm">
          Confirm and start
        </button>
      ) : null}
    </div>
  );
}
