"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function NewClaim() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("politics");
  const [kind, setKind] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [entities, setEntities] = useState("");
  const [notes, setNotes] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claim,
          speaker,
          topic,
          pillar,
          statementKind: kind,
          postUrl,
          entities,
          notes,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; id?: string; message?: string };
      if (!payload.ok || !payload.id) {
        setMessage(payload.message || "The claim was not filed.");
        return;
      }
      router.push(`/claims/${payload.id}`);
      router.refresh();
    } catch {
      setMessage("The desk could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-rule bg-paper">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl">New claim</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
            File a sentence by hand. This does not search, and it does not ask a model to invent a source.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 items-center border border-ink px-4 text-sm"
        >
          {open ? "Close" : "New claim"}
        </button>
      </div>
      {open ? (
        <form onSubmit={submit} className="grid gap-3 border-t border-rule px-4 py-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Claim
            <textarea
              required
              value={claim}
              onChange={(event) => setClaim(event.target.value)}
              rows={3}
              className="mt-1 w-full border border-rule bg-paper px-3 py-2 outline-none focus:border-ink"
            />
          </label>
          <label className="text-sm">
            Speaker
            <input value={speaker} onChange={(event) => setSpeaker(event.target.value)} className="mt-1 h-10 w-full border border-rule px-3 outline-none focus:border-ink" />
          </label>
          <label className="text-sm">
            Topic
            <input value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1 h-10 w-full border border-rule px-3 outline-none focus:border-ink" />
          </label>
          <label className="text-sm">
            Pillar
            <select value={pillar} onChange={(event) => setPillar(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
              <option value="politics">Politics</option>
              <option value="football">Manchester United</option>
              <option value="finance">Finance</option>
            </select>
          </label>
          <label className="text-sm">
            Statement
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 h-10 w-full border border-rule bg-paper px-2">
              <option value="">Infer from the sentence</option>
              <option value="fact">Fact</option>
              <option value="analysis">Analysis</option>
              <option value="opinion">Opinion</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Source post URL, optional
            <input value={postUrl} onChange={(event) => setPostUrl(event.target.value)} placeholder="https://" className="mt-1 h-10 w-full border border-rule px-3 outline-none focus:border-ink" />
          </label>
          <label className="text-sm sm:col-span-2">
            Entities, optional
            <input value={entities} onChange={(event) => setEntities(event.target.value)} placeholder="Comma separated" className="mt-1 h-10 w-full border border-rule px-3 outline-none focus:border-ink" />
          </label>
          <label className="text-sm sm:col-span-2">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full border border-rule px-3 py-2 outline-none focus:border-ink" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
              {busy ? "Filing…" : "File claim"}
            </button>
            {message ? <p className="mt-3 text-sm">{message}</p> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
