"use client";

import { useState } from "react";

export type StoryOption = { style: string; label: string; text: string };

const labels: Record<string, string> = {
  conversational: "Conversational",
  punchy: "Punchy",
  analytical: "Analytical",
};

export function StoryDrafts({ id, claimId, options, sourceUrl }: { id: string; claimId: string | null; options: StoryOption[]; sourceUrl: string | null }) {
  const [selected, setSelected] = useState(options[0]?.style ?? "");
  const [edits, setEdits] = useState<Record<string, string>>(() => Object.fromEntries(options.map((item) => [item.style, item.text])));
  const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const current = options.find((item) => item.style === selected) ?? options[0];
  const text = current ? edits[current.style] ?? current.text : "";

  async function save() {
    if (!claimId || !text.trim()) return;
    setPhase("saving");
    try {
      const response = await fetch("/api/desk/final", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, text, sources: sourceUrl ?? "" }),
      });
      const body = (await response.json()) as { message?: string; text?: string };
      setPhase("saved");
      setMessage(body.text ? "Final text saved. Nothing was published. The publish gate still has to approve this exact text." : (body.message || "The final text was not saved."));
    } catch {
      setPhase("idle");
      setMessage("The desk could not save that text. Nothing was published.");
    }
  }

  if (!options.length) return <p className="mt-2 text-sm text-ink-soft">No draft is stored.</p>;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.style}
            type="button"
            onClick={() => { setSelected(option.style); setPhase("idle"); setMessage(null); }}
            className={`inline-flex h-10 items-center border px-3 text-sm ${option.style === current?.style ? "border-ink bg-ink text-paper" : "border-rule"}`}
          >
            {labels[option.style] ?? option.label}
          </button>
        ))}
      </div>
      <label className="block text-sm" htmlFor={`draft-${id}`}>
        {labels[current?.style ?? ""] ?? "Draft"}
        <textarea
          id={`draft-${id}`}
          value={text}
          onChange={(event) => {
            if (!current) return;
            setEdits((existing) => ({ ...existing, [current.style]: event.target.value }));
            setPhase("idle");
          }}
          rows={8}
          className="mt-2 w-full border border-rule bg-paper px-3 py-3 text-sm leading-relaxed outline-none focus:border-ink"
        />
      </label>
      <p className="font-mono text-[11px] text-ink-soft">{text.length} characters. The post is not padded to the long-post limit.</p>
      {claimId ? (
        <button type="button" onClick={() => void save()} disabled={phase === "saving" || !text.trim()} className="inline-flex h-11 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50">
          {phase === "saving" ? "Saving…" : "Save this as final text"}
        </button>
      ) : (
        <p className="text-sm text-ink-soft">This card has no claim yet, so the final text cannot be saved.</p>
      )}
      {message ? <p className="text-sm">{message}</p> : null}
      <p className="text-sm text-ink-soft">Saving does not publish. Publishing still requires the exact approved text.</p>
    </div>
  );
}
