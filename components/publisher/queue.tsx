"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checklist } from "@/lib/system";
import { pillarLabel } from "@/lib/publisher/read";
import type { ReadyItem } from "@/lib/publisher/types";
import { chicagoStamp } from "@/lib/format";

export function ApprovalQueue({ items, notice }: { items: ReadyItem[]; notice: string }) {
  return (
    <section>
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Approve</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Ready for you.</h1>
      <p className="mt-3 text-sm text-ink-soft">Research and drafting already happened. Read the draft. Approve the exact text, or reject it. Nothing else.</p>
      <p className="mt-4 text-sm">{notice}</p>
      {items.length === 0 ? (
        <p className="mt-8 text-sm text-ink-soft">When a draft is finished, it lands here and waits for your decision.</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {items.map((item) => <ApprovalCard key={item.id} item={item} />)}
        </ul>
      )}
    </section>
  );
}

function ApprovalCard({ item }: { item: ReadyItem }) {
  const router = useRouter();
  const [style, setStyle] = useState(item.drafts[0]?.style ?? "");
  const selected = item.drafts.find((draft) => draft.style === style) ?? item.drafts[0];
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lock = useRef(false);

  async function reject() {
    if (lock.current) return;
    lock.current = true;
    setBusy("reject");
    setMessage(null);
    try {
      const response = await fetch("/api/publisher/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId: item.id }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(body.message ?? "The draft was not rejected.");
      if (body.ok) router.refresh();
    } catch {
      setMessage("The draft was not rejected.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  async function approve() {
    if (lock.current || !agree || !selected) return;
    lock.current = true;
    setBusy("approve");
    setMessage(null);
    try {
      const prepared = await fetch("/api/publisher/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId: item.id, text: selected.text }),
      });
      const ready = (await prepared.json()) as { ok?: boolean; claimId?: string; draftId?: string; text?: string; message?: string };
      if (!prepared.ok || !ready.ok || !ready.claimId || !ready.draftId || !ready.text) {
        setMessage(ready.message ?? "The draft could not be prepared. Nothing was sent to X.");
        return;
      }
      const checks = Object.fromEntries(checklist.map((entry) => [entry.id, true]));
      const intent = await fetch("/api/x/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: ready.text, claimId: ready.claimId, draftId: ready.draftId, checks }),
      });
      const opened = (await intent.json()) as { ok?: boolean; approvalId?: string; message?: string };
      if (!intent.ok || !opened.ok || !opened.approvalId) {
        setMessage(opened.message ?? "The publish gate did not open. Nothing was sent.");
        return;
      }
      const response = await fetch("/api/x/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: ready.text,
          claimId: ready.claimId,
          draftId: ready.draftId,
          approvalId: opened.approvalId,
          checks,
          confirm: true,
        }),
      });
      const posted = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(posted.ok ? "Published." : (posted.message ?? "X did not accept the post."));
      if (posted.ok) router.refresh();
    } catch {
      setMessage("The publish gate was not reached. Nothing was sent.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  return (
    <li className="border border-rule px-5 py-5">
      <p className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">{pillarLabel(item.pillar)}</p>
      <p className="mt-2 text-sm leading-relaxed">{item.claim}</p>
      <p className="mt-3 text-sm leading-relaxed">{item.why}</p>
      {item.caveats.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          {item.caveats.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {item.drafts.map((draft) => (
          <button
            key={draft.style}
            type="button"
            aria-pressed={selected?.style === draft.style}
            onClick={() => { setStyle(draft.style); setAgree(false); setMessage(null); }}
            className={`inline-flex h-9 items-center border px-3 text-sm ${selected?.style === draft.style ? "border-ink bg-ink text-paper" : "border-rule"}`}
          >
            {draft.style}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="mt-4 border border-ink px-4 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.text}</p>
          <p className="mt-3 font-mono text-[11px] text-ink-soft">{selected.text.length} characters</p>
        </div>
      ) : null}
      <div className="mt-4 space-y-1 text-sm">
        {item.sourceUrl ? <p><a href={item.sourceUrl} className="underline" target="_blank" rel="noreferrer">Open the source table</a></p> : null}
        {item.chartUrl && item.chartUrl !== item.sourceUrl ? <p><a href={item.chartUrl} className="underline" target="_blank" rel="noreferrer">Open the chart</a></p> : null}
        {item.readyAt ? <p className="text-ink-soft">Ready {chicagoStamp(item.readyAt)}</p> : null}
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
        Publish this exact text
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={!agree || !selected || busy !== null}
          className="inline-flex h-11 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
        >
          {busy === "approve" ? "Publishing…" : "Approve and publish"}
        </button>
        <button
          type="button"
          onClick={() => void reject()}
          disabled={busy !== null}
          className="inline-flex h-11 items-center border border-ink px-4 text-sm disabled:opacity-50"
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </li>
  );
}
