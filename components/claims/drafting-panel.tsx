"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeskClaim } from "@/lib/desk/types";
import { characterCount, POST_LIMIT } from "@/lib/format";
import { DRAFT_UNAVAILABLE, draftStyles, type StoredDraft } from "@/lib/drafts/rules";
import { draftUnlocked } from "@/lib/research/editor-review";

export function DraftingPanel({
  claim,
  drafts,
  geminiRemaining,
}: {
  claim: DeskClaim;
  drafts: StoredDraft[];
  geminiRemaining: number;
}) {
  const review = claim.editorReview;
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const gate = draftUnlocked({
    recordedAt: claim.verdictRecordedAt,
    angle: claim.editorAngle,
    angleText: claim.editorAngleText,
  });
  if (!review) return null;
  const angle = review.angles.find((item) => item.id === claim.editorAngle);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage(null);
    setProblems([]);
    try {
      const response = await fetch("/api/desk/drafts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId: claim.id, ...body }),
      });
      const payload = (await response.json()) as { ok?: boolean; unavailable?: boolean; message?: string; problems?: Array<{ style: string; reason: string }> };
      setUnavailable(payload.unavailable === true);
      setMessage(payload.message || (payload.ok ? "Saved." : DRAFT_UNAVAILABLE));
      setProblems((payload.problems ?? []).map((item) => `${item.style}: ${item.reason}`));
      if (payload.ok) {
        setEditing(null);
        router.refresh();
      }
    } catch {
      setUnavailable(true);
      setMessage(DRAFT_UNAVAILABLE);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="drafting" className="border border-ink bg-paper">
      <header className="border-b border-rule px-5 py-4 sm:px-6">
        <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Drafting</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed">
          Verdict {claim.proposedVerdict ?? review.proposedVerdict}. Confidence {claim.verdictConfidence ?? "Moderate"}. Angle {angle?.title ?? (claim.editorAngle === "own" ? "Your angle" : "Not chosen")}.
          {claim.editorTake ? "" : " My take is blank."}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Recommended hashtag: #CheckAm. #NotTrue is not used. Gemini drafting requests left today: {geminiRemaining}. One click sends at most one request. Saving a draft does not publish it.
        </p>
      </header>
      <div className="space-y-6 px-5 py-5 sm:px-6">
        <div>
          <button
            type="button"
            disabled={busy !== null || !gate.open}
            onClick={() => post({ action: "create" }, "create")}
            className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            {busy === "create" ? "Drafting…" : "Create draft"}
          </button>
          {!gate.open ? <p className="mt-2 text-sm">{gate.reason}</p> : null}
        </div>
        {unavailable ? (
          <p className="border border-ink px-3 py-3 font-mono text-sm tracking-[0.08em]">{DRAFT_UNAVAILABLE}</p>
        ) : null}
        {message ? <p className="max-w-3xl text-sm leading-relaxed">{message}</p> : null}
        {problems.length ? (
          <ul className="space-y-1 text-sm">
            {problems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {drafts.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {drafts.map((draft) => {
              const text = editing === draft.id ? (edits[draft.id] ?? draft.text) : draft.text;
              const count = Math.max(0, ...text.split(/\n\s*\n/).map((part) => characterCount(part.trim())).filter((value) => value > 0));
              return (
                <article key={draft.id} className={`border px-3 py-3 ${draft.selected ? "border-ink" : "border-rule"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{draft.label}</p>
                    {draft.selected ? <p className="font-mono text-[10px] tracking-[0.12em] uppercase">Selected</p> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{draftStyles.find((style) => style.id === draft.style)?.brief ?? "Written on the desk."}</p>
                  {editing === draft.id ? (
                    <textarea
                      value={text}
                      onChange={(event) => setEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                      rows={8}
                      className="mt-3 w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                    />
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{draft.text}</p>
                  )}
                  <p className="mt-2 font-mono text-[11px] text-ink-soft">
                    Longest post {count} / {POST_LIMIT} · {draft.hashtag ?? "No hashtag in this version"} · {draft.editorModified ? "Edited" : draft.provider === "gemini" ? "Model" : "Manual"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => post({ action: "select", draftId: draft.id }, draft.id)}
                      className="inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50"
                    >
                      Select
                    </button>
                    {editing === draft.id ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => post({ action: "save", draftId: draft.id, content: text }, draft.id)}
                        className="inline-flex h-9 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50"
                      >
                        {busy === draft.id ? "Saving…" : "Save draft"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setEdits((current) => ({ ...current, [draft.id]: draft.text }));
                          setEditing(draft.id);
                        }}
                        className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50"
                      >
                        Edit
                      </button>
                    )}
                    {draft.style !== "manual" ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => post({ action: "regenerate", style: draft.style }, `regen-${draft.style}`)}
                        className="inline-flex h-9 items-center border border-rule px-3 text-sm disabled:opacity-50"
                      >
                        {busy === `regen-${draft.style}` ? "Regenerating…" : "Regenerate"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="text-sm leading-relaxed text-ink-soft">
            <p>No draft is saved yet. Create draft asks for four styles in one request. You can also write one yourself.</p>
            <ul className="mt-3 space-y-2">
              {draftStyles.map((style) => (
                <li key={style.id}>
                  <span className="font-mono text-[10px] tracking-[0.12em] text-ink uppercase">{style.label}. </span>
                  {style.brief}
                </li>
              ))}
            </ul>
          </div>
        )}
        {gate.open ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void post({ action: "manual", content: manual }, "manual");
            }}
          >
            <label className="block text-sm">
              <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Write a new version</span>
              <textarea
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                rows={6}
                className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                placeholder="Your own wording. A blank line starts another post in the thread."
              />
            </label>
            <button type="submit" disabled={busy !== null || !manual.trim()} className="mt-3 inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50">
              {busy === "manual" ? "Saving…" : "Save draft"}
            </button>
            <p className="mt-2 text-sm text-ink-soft">This save does not publish.</p>
          </form>
        ) : null}
      </div>
    </section>
  );
}
