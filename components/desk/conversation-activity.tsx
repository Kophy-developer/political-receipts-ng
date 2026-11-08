"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chicagoStamp } from "@/lib/format";
import type { ActivityCard, ActivityModel } from "@/lib/intel/activity";

function PostBlock({ post, selected, onSelect }: { post: ActivityCard; selected: boolean; onSelect: () => void }) {
  const who = post.username ? `@${post.username}` : "Username not stored";
  return (
    <article className={`border px-3 py-3 ${selected ? "border-ink" : "border-rule"}`}>
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase">{post.reference || (post.membership === "related" ? "Related topic" : "In this conversation")}</p>
      <p className="mt-2 text-sm">{who}{post.displayName ? ` · ${post.displayName}` : ""}</p>
      <p className="mt-2 text-sm leading-relaxed">{post.text}</p>
      <p className="mt-2 text-sm text-ink-soft">Posted {chicagoStamp(post.postedAt)} · Collected {chicagoStamp(post.collectedAt)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
        {post.metrics.map((item) => (
          <div key={item.label}>
            <dt className="text-ink-soft">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {post.url ? <a className="inline-flex h-11 items-center underline text-sm" href={post.url} target="_blank" rel="noreferrer">Open on X</a> : <p className="text-sm text-ink-soft">No X link is stored.</p>}
        <button type="button" onClick={onSelect} className="inline-flex h-11 items-center border border-ink px-3 text-sm" aria-pressed={selected}>
          {selected ? "Selected to answer" : "Answer this post"}
        </button>
      </div>
    </article>
  );
}

export function ConversationActivity({ model, opportunityId }: { model: ActivityModel; opportunityId: string | null }) {
  const router = useRouter();
  const busy = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const posts = [model.original, ...model.exact, ...model.related].filter((post): post is ActivityCard => Boolean(post));
  const chosen = posts.find((post) => post.id === selected) ?? null;

  async function lookup() {
    if (!opportunityId || busy.current || !model.lookup?.allowed) return;
    busy.current = true;
    setPhase("working");
    try {
      const response = await fetch("/api/desk/conversation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: opportunityId, confirm: true }),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message || "The lookup did not finish.");
      setPhase("done");
      router.refresh();
    } catch {
      setPhase("idle");
      setMessage("The desk could not reach the server. No X request was confirmed.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <section className="border border-rule px-4 py-4">
      <h2 className="font-serif text-2xl">Conversation activity</h2>
      <p className="mt-2 text-sm leading-relaxed">{model.context}</p>
      {model.collapsedDuplicates > 0 ? <p className="mt-2 text-sm text-ink-soft">{model.collapsedDuplicates} repeated {model.collapsedDuplicates === 1 ? "copy was" : "copies were"} collapsed. The latest collection is shown.</p> : null}
      {posts.length === 0 ? <p className="mt-3 text-sm text-ink-soft">No stored post is linked to this story yet.</p> : null}
      {model.originalState === "absent" ? (
        <div className="mt-3 border border-rule px-3 py-3 text-sm">
          <p>The original post is not in the stored scan. Its id is {model.absentId}. The busiest reply is not treated as the original.</p>
          {model.lookup ? <p className="mt-2">{model.lookup.note}</p> : null}
          {opportunityId && model.lookup?.allowed ? (
            <button type="button" disabled={phase === "working"} onClick={() => void lookup()} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50">
              {phase === "working" ? "Looking up…" : "Confirm lookup"}
            </button>
          ) : null}
          {message ? <p className="mt-2">{message}</p> : null}
        </div>
      ) : null}
      {model.originalState === "unknown" ? <p className="mt-3 text-sm text-ink-soft">These stored posts have no X conversation id, so the original post cannot be identified.</p> : null}
      {model.original ? (
        <div className="mt-4 space-y-2">
          <h3 className="font-serif text-xl">Original post</h3>
          <PostBlock post={model.original} selected={selected === model.original.id} onSelect={() => setSelected(model.original?.id ?? null)} />
        </div>
      ) : null}
      {model.exact.length > 0 ? (
        <div className="mt-4 space-y-2">
          <h3 className="font-serif text-xl">Other posts in this conversation</h3>
          {model.exact.map((post) => <PostBlock key={post.id} post={post} selected={selected === post.id} onSelect={() => setSelected(post.id)} />)}
        </div>
      ) : null}
      {model.related.length > 0 ? (
        <div className="mt-4 space-y-2">
          <h3 className="font-serif text-xl">Related topic, not this conversation</h3>
          <p className="text-sm text-ink-soft">These posts discuss a matching subject. They are not members of the X conversation above.</p>
          {model.related.map((post) => <PostBlock key={`${post.membership}-${post.id}`} post={post} selected={selected === post.id} onSelect={() => setSelected(post.id)} />)}
        </div>
      ) : null}
      {chosen ? <p className="mt-3 text-sm">You selected {chosen.username ? `@${chosen.username}` : "this post"} to answer. No reply is sent. Publishing still requires the exact text.</p> : null}
    </section>
  );
}
