"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { characterCount } from "@/lib/format";
import { checklist } from "@/lib/system";
import { currentPublishLimit, longPostUnknownCopy, publishingCapability } from "@/lib/publish/capability";
import { publishPlan, splitForThread, threadText, type PostFormat } from "@/lib/publish/format";
import {
  completedStages,
  evidenceBrief,
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
  const [format, setFormat] = useState<PostFormat>("unset");
  const [threadPosts, setThreadPosts] = useState<string[] | null>(null);
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
  const limit = currentPublishLimit();
  const workingText = format === "thread" && threadPosts ? threadText(threadPosts) : text;
  const count = characterCount(workingText);
  const over = count > limit;
  const plan = publishPlan({ text: workingText, format: over ? format : "short", posts: threadPosts });
  const dirty = workingText !== savedText;
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
        body: JSON.stringify({ claimId: claim.id, text: workingText, sources: sourceText }),
      });
      const body = (await response.json()) as { ok?: boolean; id?: string; text?: string; message?: string };
      if (!response.ok || !body.ok || typeof body.text !== "string") {
        setNotice(body.message || "The final post was not saved.");
        return;
      }
      setText(body.text);
      setSavedText(body.text);
      if (format === "thread") {
        setThreadPosts(body.text.split(/\n\s*\n/).map((part) => part.trimEnd()).filter((part) => part.trim()));
      }
      if (typeof body.id === "string") setDraftId(body.id);
      setNotice("Final post saved. It was not published.");
      router.refresh();
    } catch {
      setNotice("The final post was not saved.");
    } finally {
      setBusy(false);
    }
  }

  function takeSuggestion(value: string) {
    setText(value);
    setFormat("unset");
    setThreadPosts(null);
  }

  function chooseThread() {
    setFormat("thread");
    setThreadPosts(splitForThread(text).posts);
  }

  function chooseShort() {
    setFormat("short");
    setThreadPosts(null);
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
            <p className={`mt-3 font-mono text-[11px] ${over ? "text-stamp" : "text-ink-soft"}`}>{count} / {limit}</p>
            {format === "thread" && threadPosts ? (
              <ol className="mt-4 space-y-3">
                {threadPosts.map((post, index) => (
                  <li key={index}>
                    <label className="block text-sm" htmlFor={`post-${index}`}>Post {index + 1}</label>
                    <textarea
                      id={`post-${index}`}
                      value={post}
                      onChange={(event) => setThreadPosts((current) => {
                        const next = (current ?? []).slice();
                        next[index] = event.target.value;
                        return next;
                      })}
                      rows={5}
                      className="mt-1 w-full border border-rule bg-paper px-3 py-3 text-sm leading-relaxed outline-none focus:border-ink"
                    />
                    <p className={`mt-1 font-mono text-[11px] ${characterCount(post) > limit ? "text-stamp" : "text-ink-soft"}`}>{characterCount(post)} / {limit}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <textarea
                value={text}
                onChange={(event) => { setText(event.target.value); if (format === "thread") setThreadPosts(null); }}
                rows={10}
                ref={editorRef}
                aria-label="Final post"
                className="mt-4 w-full border border-rule bg-paper px-3 py-3 text-sm leading-relaxed outline-none focus:border-ink"
              />
            )}
            {over ? (
              <div className="mt-4 border border-stamp px-4 py-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-stamp uppercase">Longer than current publish limit</p>
                <p className="mt-2 text-sm leading-relaxed">{longPostUnknownCopy}</p>
                <fieldset className="mt-4">
                  <legend className="font-mono text-[11px] tracking-[0.14em] uppercase">Post format</legend>
                  <div className="mt-3 space-y-3 text-sm">
                    <label className="flex items-start gap-2 text-ink-soft">
                      <input type="radio" name="post-format" disabled checked={false} />
                      <span>Long post. Disabled. {publishingCapability.longPostSupported === "unknown" ? "API publishing support is not verified." : "This account cannot send one."}</span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="post-format" checked={format === "thread"} onChange={chooseThread} />
                      <span>Thread. Splits on sentences, then you can edit each post. Nothing in the thread is sent.</span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="post-format" checked={format === "short"} onChange={chooseShort} />
                      <span>Shorten to one post. The text is not cut for you.</span>
                    </label>
                  </div>
                </fieldset>
                {format !== "unset" ? <p className="mt-3 text-sm">Publishing as {plan.label}. {plan.reason}</p> : <p className="mt-3 text-sm">Choose a format here. The choice is not left until review.</p>}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">Publishing as a single post.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void save()} disabled={busy || !workingText.trim()} className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50">
                {busy ? "Saving…" : "Save final post"}
              </button>
              <button type="button" onClick={() => { setText(""); setFormat("unset"); setThreadPosts(null); }} className="inline-flex h-10 items-center border border-ink px-4 text-sm">
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
                        <button type="button" onClick={() => takeSuggestion(suggestion.text)} className="inline-flex h-9 items-center border border-ink px-3 text-sm">Use this</button>
                        <button type="button" onClick={() => { takeSuggestion(suggestion.text); editorRef.current?.focus(); }} className="inline-flex h-9 items-center border border-rule px-3 text-sm">Edit</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              disabled={!savedText.trim() || dirty || (over && format === "unset")}
              onClick={() => { setShowReview(true); setConfirming(false); }}
              className="mt-6 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
            >
              Continue to review
            </button>
          </section>

          {showReview ? (
            <section className="border border-ink px-4 py-5 sm:px-5">
              <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">Review</h2>
              <p className="mt-4 font-mono text-[11px] tracking-[0.14em] uppercase">Publishing as</p>
              <p className="mt-1 text-sm">{plan.label}</p>
              <ol className="mt-3 space-y-3">
                {plan.posts.map((post, index) => (
                  <li key={`${index}-${post.slice(0, 16)}`} className="border border-rule px-3 py-3">
                    <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{plan.posts.length > 1 ? `Post ${index + 1}` : "Exact text"}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{post}</p>
                    <p className="mt-2 font-mono text-[11px] text-ink-soft">{characterCount(post)} / {limit}</p>
                  </li>
                ))}
              </ol>
              {plan.reason ? <p className="mt-3 text-sm">{plan.reason}</p> : null}
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
                  <p className="font-mono text-[11px] tracking-[0.14em] uppercase">Exact payload</p>
                  <ol className="mt-3 space-y-3">
                    {plan.posts.map((post, index) => (
                      <li key={`confirm-${index}`} className="whitespace-pre-wrap text-sm leading-relaxed">{plan.posts.length > 1 ? `Post ${index + 1}: ${post}` : post}</li>
                    ))}
                  </ol>
                  {plan.send && !dirty ? (
                    <ConfirmSend claimId={claim.id} draftId={draftId} text={savedText} />
                  ) : (
                    <p className="mt-3 text-sm">{plan.reason ?? "Save the final post before it can be sent."} Nothing has been sent.</p>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="h-fit border border-rule px-4 py-4 lg:sticky lg:top-6">
          <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase">X preview</h2>
          {plan.posts.length === 0 ? <p className="mt-3 text-sm text-ink-soft">The preview follows the final post.</p> : (
            <ol className="mt-3 space-y-3">
              {plan.posts.map((post, index) => (
                <li key={`${index}-${post.slice(0, 12)}`} className="border border-rule px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase">{plan.posts.length > 1 ? `Post ${index + 1}` : "Single post"}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{post}</p>
                  <p className={`mt-2 font-mono text-[11px] ${characterCount(post) > limit ? "text-stamp" : "text-ink-soft"}`}>
                    {characterCount(post)} / {limit}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">{plan.send ? "This preview is the text a confirmed publish would send." : plan.reason}</p>
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
