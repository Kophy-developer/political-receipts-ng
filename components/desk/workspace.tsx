"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { characterCount, POST_LIMIT } from "@/lib/format";
import { checklist } from "@/lib/system";
import {
  completedStages,
  convertToTwoPosts,
  evidenceBrief,
  previewPosts,
  publishablePost,
  reviewChecklist,
  reviewComplete,
  storyStage,
  storyStages,
  type StoryStage,
} from "@/lib/desk/story";

type Suggestion = { id: string; label: string; text: string };

type ClaimCard = {
  id: string;
  title: string;
  postText: string;
  postUrl: string | null;
  verdict: string | null;
  confidence: string | null;
  angle: string | null;
  verdictRecorded: boolean;
  angleChosen: boolean;
  evidence: Array<{ review: string; tier: string; title: string; organization: string }>;
  recorded: Array<{ kind: string; label: string }>;
};

export function StoryWorkspace({
  claim,
  finalPostId,
  finalText,
  sources,
  suggestions,
}: {
  claim: ClaimCard;
  finalPostId: string | null;
  finalText: string;
  sources: string;
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(finalText);
  const [draftId, setDraftId] = useState(finalPostId);
  const [sourceText, setSourceText] = useState(sources);
  const [savedText, setSavedText] = useState(finalText);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const facts = {
    hasConversation: Boolean(claim.postText),
    acceptedEvidence: claim.evidence.filter((item) => item.review === "accepted").length,
    verdictRecorded: claim.verdictRecorded,
    angleChosen: claim.angleChosen,
    finalText: savedText,
  };
  const detected = storyStage(facts);
  const current: StoryStage = showReview || confirming ? "review" : detected === "review" && !showReview ? "write" : detected;
  const done = new Set(completedStages(showReview || confirming ? "review" : detected));
  const preview = previewPosts(text);
  const gate = publishablePost(savedText || text);
  const brief = evidenceBrief(claim.evidence, claim.recorded);
  const accepted = claim.evidence.filter((item) => item.review === "accepted");
  const recorded = claim.recorded.filter((item) => item.kind !== "original allegation");

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/desk/final", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId: claim.id, text, sources: sourceText }),
      });
      const body = (await response.json()) as { ok?: boolean; id?: string; text?: string; message?: string };
      if (!response.ok || !body.ok || typeof body.text !== "string") {
        setNotice(body.message || "The final post was not saved.");
        return;
      }
      setText(body.text);
      setSavedText(body.text);
      if (typeof body.id === "string") setDraftId(body.id);
      setNotice("Final post saved. It was not published.");
      router.refresh();
    } catch {
      setNotice("The final post was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
      <Link href="/desk" className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">Desk</Link>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight tracking-[-0.03em]">{claim.title}</h1>
      <ol className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label="Story progress">
        {storyStages.map((stage) => {
          const active = stage.id === current;
          const complete = done.has(stage.id) || (stage.id === "write" && showReview);
          return (
            <li
              key={stage.id}
              className={`min-w-[7.5rem] border px-3 py-2 ${active ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="block font-mono text-[10px] tracking-[0.14em] uppercase">{complete && !active ? "Done" : active ? "Now" : "Later"}</span>
              <span className="mt-1 block text-sm">{complete && !active ? `✓ ${stage.label}` : stage.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <details className="border border-rule px-4 py-3">
            <summary className="cursor-pointer text-sm">Original conversation</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{claim.postText}</p>
            {claim.postUrl ? <a className="mt-2 inline-block text-sm underline" href={claim.postUrl}>Open the post</a> : null}
          </details>
          <details className="border border-rule px-4 py-3">
            <summary className="cursor-pointer text-sm">Research</summary>
            <p className="mt-3 text-sm leading-relaxed">{brief.line}</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-ink-soft">Research details</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {accepted.length > 0 ? accepted.map((item) => (
                  <li key={item.title}>{item.organization}: {item.title}</li>
                )) : recorded.map((item) => (
                  <li key={item.label}>{item.label}</li>
                ))}
              </ul>
            </details>
          </details>
          <details className="border border-rule px-4 py-3">
            <summary className="cursor-pointer text-sm">Editorial decision</summary>
            <p className="mt-3 text-sm">Verdict {claim.verdict ?? "Not recorded"}. Confidence {claim.confidence ?? "Not recorded"}.</p>
            <p className="mt-1 text-sm">Angle {claim.angle ?? "Not chosen"}.</p>
          </details>

          <section className="border border-ink px-4 py-5 sm:px-5">
            <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Final post</h2>
            <p className="mt-2 text-sm text-ink-soft">This is the text that can be published. Saving it does not change the AI suggestions.</p>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={10}
              ref={editorRef}
              aria-label="Final post"
              className="mt-4 w-full border border-rule bg-paper px-3 py-3 text-sm leading-relaxed outline-none focus:border-ink"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void save()} disabled={busy || !text.trim()} className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
                {busy ? "Saving…" : "Save final post"}
              </button>
              <button type="button" onClick={() => setText("")} className="inline-flex h-10 items-center border border-ink px-4 text-sm">
                Write my own
              </button>
            </div>
            {notice ? <p className="mt-3 text-sm">{notice}</p> : null}

            <details className="mt-6 border-t border-rule pt-4">
              <summary className="cursor-pointer text-sm">Supporting sources, optional</summary>
              <p className="mt-2 text-sm text-ink-soft">Up to four https links. They stay out of the final post. The current publish gate does not send them.</p>
              <textarea
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                rows={4}
                aria-label="Supporting sources"
                placeholder="One https link per line"
                className="mt-3 w-full border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </details>

            <div className="mt-6 border-t border-rule pt-4">
              <h3 className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">AI suggestions</h3>
              {suggestions.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No suggestion is saved. You can write the post yourself.</p> : (
                <ul className="mt-3 space-y-4">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.id} className="border border-rule px-3 py-3">
                      <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{suggestion.label}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{suggestion.text}</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => setText(suggestion.text)} className="inline-flex h-9 items-center border border-ink px-3 text-sm">Use this</button>
                        <button type="button" onClick={() => { setText(suggestion.text); editorRef.current?.focus(); }} className="inline-flex h-9 items-center border border-rule px-3 text-sm">Edit</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              disabled={!savedText.trim()}
              onClick={() => { setShowReview(true); setConfirming(false); }}
              className="mt-6 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
            >
              Continue to review
            </button>
          </section>

          {showReview ? (
            <section className="border border-ink px-4 py-5 sm:px-5">
              <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Review</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{savedText}</p>
              {sourceText.trim() ? (
                <div className="mt-4 border border-rule px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase">Source follow-up</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{sourceText.trim()}</p>
                  <p className="mt-2 text-xs text-ink-soft">Not part of the final post. This publish action will not send these links.</p>
                </div>
              ) : null}
              <dl className="mt-4 space-y-1 text-sm">
                <div>Verdict: {claim.verdict ?? "Not recorded"}</div>
                <div>Confidence: {claim.confidence ?? "Not recorded"}</div>
                <div>Evidence: {brief.line}</div>
              </dl>
              <ul className="mt-4 space-y-2">
                {reviewChecklist.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checks[item.id] === true}
                        onChange={(event) => setChecks((current) => ({ ...current, [item.id]: event.target.checked }))}
                      />
                      {item.label}
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!reviewComplete(checks)}
                onClick={() => setConfirming(true)}
                className="mt-5 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
              >
                Ready to publish
              </button>
              {confirming ? (
                <div className="mt-5 border border-ink px-4 py-4">
                  <p className="font-mono text-[11px] tracking-[0.14em] uppercase">Exact text</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{savedText}</p>
                  {gate.ok ? (
                    <ConfirmSend claimId={claim.id} draftId={draftId} text={gate.text} />
                  ) : (
                    <p className="mt-3 text-sm">{gate.reason} Nothing has been sent.</p>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="h-fit border border-rule px-4 py-4 lg:sticky lg:top-6">
          <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">X preview</h2>
          {preview.posts.length === 0 ? <p className="mt-3 text-sm text-ink-soft">The preview follows the final post.</p> : (
            <ol className="mt-3 space-y-3">
              {preview.posts.map((post, index) => (
                <li key={`${index}-${post.slice(0, 12)}`} className="border border-rule px-3 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{post}</p>
                  <p className={`mt-2 font-mono text-[11px] ${characterCount(post) > POST_LIMIT ? "text-stamp" : "text-ink-soft"}`}>
                    {characterCount(post)} / {POST_LIMIT}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {preview.overflow ? (
            <button type="button" onClick={() => { const next = convertToTwoPosts(text); if (next) setText(next); }} className="mt-3 text-sm underline">
              Convert to 2 posts
            </button>
          ) : null}
          {sourceText.trim() ? <p className="mt-4 text-xs leading-relaxed text-ink-soft">Source follow-up stays beside the post. It is not added to the text above.</p> : null}
        </aside>
      </div>
    </div>
  );
}

function ConfirmSend({ claimId, draftId, text }: { claimId: string; draftId: string | null; text: string }) {
  const [agree, setAgree] = useState(false);
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    if (!agree || !draftId || posting) return;
    setPosting(true);
    setMessage(null);
    const checks = Object.fromEntries(checklist.map((item) => [item.id, true]));
    try {
      const intent = await fetch("/api/x/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, claimId, draftId, checks }),
      });
      const opened = (await intent.json()) as { ok?: boolean; approvalId?: string; message?: string };
      if (!intent.ok || !opened.ok || !opened.approvalId) {
        setMessage(opened.message || "The publish gate did not open. Nothing was sent.");
        return;
      }
      const response = await fetch("/api/x/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, claimId, draftId, approvalId: opened.approvalId, checks, confirm: true }),
      });
      const posted = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(posted.ok ? "Sent." : (posted.message || "X did not accept the post. Nothing else was changed."));
    } catch {
      setMessage("The publish gate was not reached. Nothing was sent.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm">This is the only text a confirmed publish would send. Source links are not included. Nothing is sent until you confirm.</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
        Send this exact text
      </label>
      <button type="button" onClick={() => void send()} disabled={!agree || !draftId || posting} className="mt-3 inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50">
        {posting ? "Sending…" : "Post this exact text"}
      </button>
      {!draftId ? <p className="mt-2 text-sm">Save the final post before it can be sent.</p> : null}
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
