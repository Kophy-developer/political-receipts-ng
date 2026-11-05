"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeskClaim } from "@/lib/desk/types";
import { chicagoStamp } from "@/lib/format";
import { defaultEditorName } from "@/lib/identity";
import { angleChosen, draftUnlocked, type ReviewAngleId } from "@/lib/research/editor-review";

const verdicts = ["SUPPORTED", "CONTRADICTED", "MISLEADING", "NEEDS CONTEXT", "UNVERIFIED", "INSUFFICIENT EVIDENCE"] as const;
const sourceOrder = ["INEC primary records", "BBC reporting", "Daily Trust reporting", "Original X allegation"];

function confidenceValue(label: DeskClaim["verdictConfidence"]): "low" | "moderate" | "high" {
  if (label === "High") return "high";
  if (label === "Low") return "low";
  return "moderate";
}

export function EditorReview({ claim, editorName = defaultEditorName }: { claim: DeskClaim; editorName?: string }) {
  const review = claim.editorReview;
  if (!review) return null;
  const formKey = [claim.editorAngle, claim.editorAngleText, claim.editorTake, claim.proposedVerdict, claim.verdictConfidence, claim.verdictRecordedAt].join("|");
  return <EditorReviewForm key={formKey} claim={claim} review={review} editorName={editorName} />;
}

function EditorReviewForm({ claim, review, editorName }: { claim: DeskClaim; review: NonNullable<DeskClaim["editorReview"]>; editorName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [angle, setAngle] = useState<ReviewAngleId | "">(claim.editorAngle ?? "");
  const [angleText, setAngleText] = useState(claim.editorAngleText ?? "");
  const [take, setTake] = useState(claim.editorTake ?? "");
  const [verdict, setVerdict] = useState(claim.proposedVerdict && verdicts.includes(claim.proposedVerdict as (typeof verdicts)[number]) ? claim.proposedVerdict : "NEEDS CONTEXT");
  const [confidence, setConfidence] = useState(confidenceValue(claim.verdictConfidence));

  const gate = draftUnlocked({
    recordedAt: claim.verdictRecordedAt,
    angle: claim.editorAngle,
    angleText: claim.editorAngleText,
  });
  const dirty = angle !== (claim.editorAngle ?? "") || angleText !== (claim.editorAngleText ?? "") || take !== (claim.editorTake ?? "");
  const verdictDirty = verdict !== (claim.proposedVerdict ?? review.proposedVerdict);
  const acceptLabel = (claim.proposedVerdict ?? review.proposedVerdict) === "NEEDS CONTEXT" ? "Accept NEEDS CONTEXT" : `Accept ${claim.proposedVerdict}`;

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch("/api/research/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId: claim.id, ...body }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(payload.message || (payload.ok ? "Saved." : "That did not save."));
      if (payload.ok) router.refresh();
    } catch {
      setMessage("The desk could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border border-ink bg-paper">
      <header className="border-b border-rule px-5 py-4 sm:px-6">
        <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Editor review</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Proposed for this investigation. Nothing here is published, and the original post is left as filed.
        </p>
      </header>
      <div className="grid items-start gap-6 px-5 py-5 sm:px-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Proposed verdict</p>
            <p className="mt-2 font-serif text-4xl leading-none">{claim.proposedVerdict ?? review.proposedVerdict}</p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed">{claim.verdictReasoning || review.explanation}</p>
            {claim.verdictCaveats ? <p className="mt-2 max-w-3xl text-sm leading-relaxed">{claim.verdictCaveats}</p> : null}
            <p className="mt-3 text-sm">Proposed confidence: {claim.verdictConfidence ?? "Moderate"}</p>
            <p className="mt-2 text-sm text-ink-soft">The claim stays {claim.status} until you accept. The header format follows that recorded status.</p>
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Separated claims</p>
            <ul className="mt-3 space-y-3">
              {review.findings.map((finding) => (
                <li key={`${finding.label}-${finding.text}`} className="border border-rule px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{finding.label}</p>
                  <p className="mt-2 text-sm leading-relaxed">{finding.text}</p>
                </li>
              ))}
            </ul>
          </div>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Editorial angle</legend>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
              Starting points, not a finished opinion. Pick one, or write your own. My take is optional, and it is left blank for you.
            </p>
            <div className="mt-3 space-y-3">
              {review.angles.map((item) => (
                <label key={item.id} className="block border border-rule px-3 py-3">
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      name={`angle-${claim.id}`}
                      className="mt-1"
                      checked={angle === item.id}
                      onChange={() => setAngle(item.id)}
                    />
                    <span>
                      <span className="font-mono text-[10px] tracking-[0.12em] uppercase">{item.title}</span>
                      <ul className="mt-2 space-y-1 text-sm leading-relaxed">
                        {item.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </span>
                  </span>
                </label>
              ))}
              <label className="block border border-rule px-3 py-3">
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name={`angle-${claim.id}`}
                    className="mt-1"
                    checked={angle === "own"}
                    onChange={() => setAngle("own")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase">Write my own angle</span>
                    {angle === "own" ? (
                      <textarea
                        value={angleText}
                        onChange={(event) => setAngleText(event.target.value)}
                        rows={4}
                        className="mt-2 w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                        placeholder="Write the angle in your own words."
                      />
                    ) : null}
                  </span>
                </span>
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">My take</span>
              <textarea
                value={take}
                onChange={(event) => setTake(event.target.value)}
                rows={4}
                className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                placeholder="Optional. Your reading, in your words."
              />
            </label>
            <button
              type="button"
              disabled={busy !== null || !angleChosen(angle, angleText)}
              onClick={() => post({ action: "save_angle", angle, angleText, take }, "angle")}
              className="mt-3 inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
            >
              {busy === "angle" ? "Saving…" : "Save angle"}
            </button>
            {dirty ? <p className="mt-2 text-sm text-ink-soft">Save the angle before a draft can use it.</p> : null}
            {claim.editorAngle ? (
              <p className="mt-2 text-sm">
                Saved angle: {claim.editorAngle === "own" ? "Write my own angle" : review.angles.find((item) => item.id === claim.editorAngle)?.title}
                {claim.editorTake ? ` · My take is filed.` : ""}
              </p>
            ) : null}
          </fieldset>

          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Format suggestion</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">{review.formatRecommendation}</span>. {review.formatNote}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{review.followUpNote}</p>
            <p className="mt-2 text-sm leading-relaxed">{review.notTrueNote}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Verdict</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
              Accept records the editor, the time, the evidence beside this decision, the reasoning, and the confidence. Changing the verdict or requesting more research withdraws a recorded decision. Neither action publishes, and neither rewrites the original post.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="text-sm">
                <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Confidence</span>
                <select
                  value={confidence}
                  onChange={(event) => setConfidence(event.target.value as "low" | "moderate" | "high")}
                  className="mt-1 block h-10 w-full border border-rule bg-paper px-2 text-sm sm:w-40"
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy !== null || verdictDirty}
                onClick={() => post({ action: "accept_verdict", confidence }, "accept")}
                className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
              >
                {busy === "accept" ? "Recording…" : acceptLabel}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="text-sm">
                <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Change verdict</span>
                <select
                  value={verdict}
                  onChange={(event) => setVerdict(event.target.value)}
                  className="mt-1 block h-10 w-full border border-rule bg-paper px-2 text-sm sm:w-64"
                >
                  {verdicts.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post({ action: "set_verdict", verdict }, "verdict")}
                className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
              >
                {busy === "verdict" ? "Saving…" : "Change verdict"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => post({ action: "request_more" }, "more")}
                className="inline-flex h-10 items-center border border-rule px-4 text-sm disabled:opacity-50"
              >
                {busy === "more" ? "Requesting…" : "Request more research"}
              </button>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
              {verdictDirty
                ? "Save the changed verdict before accepting it. The reasoning above stays until you read it and accept."
                : "Changing the verdict does not rewrite the reasoning above. Read it before you accept."}
            </p>
          </div>

          {claim.verdictRecordedAt ? (
            <div className="border border-ink px-3 py-3">
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase">Recorded decision</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Editor</dt>
                  <dd>{editorName}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Timestamp</dt>
                  <dd>{chicagoStamp(claim.verdictRecordedAt)}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Confidence</dt>
                  <dd>{claim.verdictConfidence ?? claim.confidence ?? "Not scored"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Reasoning</dt>
                  <dd className="leading-relaxed">{claim.verdictReasoning || review.explanation}</dd>
                </div>
              </dl>
              <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Evidence used</p>
              <ul className="mt-2 space-y-2">
                {(claim.verdictEvidenceUsed.length ? claim.verdictEvidenceUsed : review.sources).map((source) => (
                  <li key={source.url} className="text-sm">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase">{source.kind}. </span>
                    <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No verdict is recorded yet. NEEDS CONTEXT is only a proposal.</p>
          )}

          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Drafting gate</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed">{gate.reason}</p>
            <a href="#drafting" className="mt-3 inline-block text-sm underline decoration-rule underline-offset-4">
              Go to Create draft
            </a>
          </div>
          {message ? <p className="max-w-2xl text-sm">{message}</p> : null}
        </div>

        <aside className="border border-rule xl:sticky xl:top-4">
          <header className="border-b border-rule px-4 py-3">
            <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Evidence</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">Each link opens the source. A search result is not listed here.</p>
          </header>
          <div className="space-y-4 px-4 py-4">
            {sourceOrder.map((group) => {
              const items = review.sources.filter((source) => source.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{group}</p>
                  <ul className="mt-2 space-y-3">
                    {items.map((source) => (
                      <li key={source.url} className="border border-rule px-3 py-3">
                        <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">{source.kind}</p>
                        <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm underline decoration-rule underline-offset-4">
                          {source.label}
                        </a>
                        <p className="mt-2 text-sm leading-relaxed">{source.note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
