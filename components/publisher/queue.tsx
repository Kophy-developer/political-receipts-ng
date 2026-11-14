"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checklist } from "@/lib/system";
import { pillarLabel } from "@/lib/publisher/read";
import type { ReadyItem } from "@/lib/publisher/types";
import { chicagoStamp } from "@/lib/format";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition(): SpeechRecognitionLike | null {
  const root = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = root.SpeechRecognition ?? root.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function ApprovalQueue({ items, notice }: { items: ReadyItem[]; notice: string }) {
  return (
    <section>
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Approve</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">Ready for you.</h1>
      <p className="mt-3 text-sm text-ink-soft">Edit the draft, or tell the AI how to rephrase it. Publish only when the exact text is right.</p>
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
  const [text, setText] = useState(selected?.text ?? "");
  const [baseline, setBaseline] = useState(selected?.text ?? "");
  const [instruction, setInstruction] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | "rephrase" | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lock = useRef(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognition.current?.stop();
    };
  }, []);

  function chooseStyle(next: string) {
    const draft = item.drafts.find((entry) => entry.style === next) ?? item.drafts[0];
    setStyle(next);
    setText(draft?.text ?? "");
    setBaseline(draft?.text ?? "");
    setAgree(false);
    setMessage(null);
  }

  function stopVoice() {
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }

  function startVoice() {
    if (busy || listening) return;
    const session = speechRecognition();
    if (!session) {
      setMessage("Voice is not available in this browser. Type the rewrite instruction instead.");
      return;
    }
    setMessage(null);
    session.lang = "en-NG";
    session.continuous = false;
    session.interimResults = false;
    session.onresult = (event) => {
      const spoken = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (spoken) setInstruction((current) => (current ? `${current.trim()} ${spoken}` : spoken));
    };
    session.onerror = (event) => {
      setListening(false);
      recognition.current = null;
      if (event.error === "not-allowed") setMessage("Microphone access was blocked. Type the instruction instead.");
      else if (event.error !== "aborted") setMessage("Voice capture stopped. Type the instruction, or try again.");
    };
    session.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = session;
    setListening(true);
    try {
      session.start();
    } catch {
      setListening(false);
      recognition.current = null;
      setMessage("Voice capture could not start. Type the instruction instead.");
    }
  }

  async function rephrase() {
    if (lock.current || !text.trim() || !instruction.trim()) return;
    stopVoice();
    lock.current = true;
    setBusy("rephrase");
    setMessage(null);
    try {
      const response = await fetch("/api/publisher/rephrase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          instruction,
          claim: item.claim,
          caveats: item.caveats,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; text?: string; message?: string };
      if (!response.ok || !body.ok || typeof body.text !== "string") {
        setMessage(body.message ?? "The rewrite did not finish. Nothing was published.");
        return;
      }
      setText(body.text);
      setAgree(false);
      setMessage(body.message ?? "Rewrite ready. Review it before publishing.");
    } catch {
      setMessage("The rewrite did not finish. Nothing was published.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  async function reject() {
    if (lock.current) return;
    stopVoice();
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
    if (lock.current || !agree || !text.trim()) return;
    stopVoice();
    lock.current = true;
    setBusy("approve");
    setMessage(null);
    try {
      const prepared = await fetch("/api/publisher/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId: item.id, text }),
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
      const posted = (await response.json()) as { ok?: boolean; message?: string; queueCleared?: boolean; queueMessage?: string | null };
      if (!posted.ok) {
        setMessage(posted.message ?? "X did not accept the post.");
        return;
      }
      setMessage(posted.queueCleared === false && posted.queueMessage ? `Published. ${posted.queueMessage}` : "Published.");
      router.refresh();
    } catch {
      setMessage("The publish gate was not reached. Nothing was sent.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  const dirty = text.trim() !== baseline.trim();

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
            onClick={() => chooseStyle(draft.style)}
            className={`inline-flex h-9 items-center border px-3 text-sm ${selected?.style === draft.style ? "border-ink bg-ink text-paper" : "border-rule"}`}
          >
            {draft.style}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm">
        <span className="text-ink-soft">Draft text</span>
        <textarea
          value={text}
          onChange={(event) => { setText(event.target.value); setAgree(false); setMessage(null); }}
          rows={8}
          className="mt-2 w-full border border-ink bg-paper px-3 py-3 text-sm leading-relaxed"
        />
      </label>
      <p className="mt-2 font-mono text-[11px] text-ink-soft">{text.length} characters{dirty ? " · edited" : ""}</p>
      <div className="mt-4 border border-rule px-4 py-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">Rephrase</p>
        <p className="mt-2 text-sm text-ink-soft">Type an instruction, or speak it. The AI rewrites this draft only. It does not publish.</p>
        <label className="mt-3 block text-sm">
          <span className="text-ink-soft">Instruction</span>
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            placeholder="Example: Make this shorter and lead with the 113.9% figure."
            className="mt-2 w-full border border-rule bg-paper px-3 py-3 text-sm leading-relaxed"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => (listening ? stopVoice() : startVoice())}
            disabled={busy !== null}
            className="inline-flex h-10 items-center border border-ink px-3 text-sm disabled:opacity-50"
          >
            {listening ? "Stop listening" : "Speak instruction"}
          </button>
          <button
            type="button"
            onClick={() => void rephrase()}
            disabled={!text.trim() || !instruction.trim() || busy !== null}
            className="inline-flex h-10 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50"
          >
            {busy === "rephrase" ? "Rewriting…" : "Rewrite with AI"}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={() => { setText(baseline); setAgree(false); setMessage(null); }}
              disabled={busy !== null}
              className="inline-flex h-10 items-center border border-rule px-3 text-sm disabled:opacity-50"
            >
              Restore prepared draft
            </button>
          ) : null}
        </div>
      </div>
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
          disabled={!agree || !text.trim() || busy !== null}
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
