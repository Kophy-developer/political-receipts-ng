"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContinueResearch({ id, action = "continue", label = "Continue research" }: { id: string; action?: "continue" | "open-saved"; label?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirm" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setPhase("working");
    setMessage(action === "open-saved" ? "Opening a saved document. No new search is being sent." : "Continuing research. Stay on this story.");
    try {
      const response = await fetch("/api/desk/develop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = (await response.json()) as { message?: string };
      setPhase("done");
      setMessage(body.message || "Research stopped. Nothing was published.");
      router.refresh();
    } catch {
      setPhase("idle");
      setMessage("The desk could not reach the server. Nothing was sent.");
    }
  }

  return (
    <div className="mt-3">
      <button type="button" disabled={phase === "working"} onClick={() => setPhase("confirm")} className="inline-flex h-11 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50">
        {phase === "working" ? "Working…" : label}
      </button>
      {phase === "confirm" || phase === "done" ? (
        <div className="mt-2 border border-rule px-3 py-2">
          <p className="text-sm">{phase === "confirm" ? (action === "open-saved" ? "Confirm opening the saved document above. No new search will be sent." : "Confirm the searches and document requests above. Nothing has been sent.") : message}</p>
          {phase === "confirm" ? (
            <button type="button" onClick={() => void send()} className="mt-2 inline-flex h-11 items-center border border-ink px-3 text-sm">
              Confirm and continue
            </button>
          ) : null}
        </div>
      ) : message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
