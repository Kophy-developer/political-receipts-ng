"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContinueResearch({ id }: { id: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirm" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setPhase("working");
    setMessage("Continuing research. Stay on this story.");
    try {
      const response = await fetch("/api/desk/develop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "continue" }),
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
        {phase === "working" ? "Continuing…" : "Continue research"}
      </button>
      {phase === "confirm" || phase === "done" ? (
        <div className="mt-2 border border-rule px-3 py-2">
          <p className="text-sm">{phase === "confirm" ? "Confirm the searches and document requests above. Nothing has been sent." : message}</p>
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
