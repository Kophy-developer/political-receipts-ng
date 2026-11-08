"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyPass, restoreCard } from "@/lib/desk/board";
import { contentPillarFromStorage, pillarLabels } from "@/lib/pillars/catalog";

export type BoardCard = {
  id: string;
  claimId: string | null;
  title: string;
  sourceText: string | null;
  storyState: string;
  storyReason: string;
  storyAction: string;
  pillar: string | null;
  lifecycle: string;
  lowValue: boolean;
  displayNumber?: number;
  older: boolean;
};

function hrefFor(card: BoardCard, from: string) {
  return `/desk/work/${card.id}?from=${from}`;
}

export function ScanBoard({
  thisScan,
  working,
  earlier,
  passed,
  place = "investigate",
}: {
  thisScan: BoardCard[];
  working: BoardCard[];
  earlier: BoardCard[];
  passed: BoardCard[];
  place?: "discover" | "investigate";
}) {
  const [scanCards, setScanCards] = useState(thisScan);
  const [workingCards, setWorkingCards] = useState(working);
  const [earlierCards, setEarlierCards] = useState(earlier);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function remove(id: string) {
    const scanIndex = scanCards.findIndex((card) => card.id === id);
    const workingIndex = workingCards.findIndex((card) => card.id === id);
    const earlierIndex = earlierCards.findIndex((card) => card.id === id);
    const card = scanCards[scanIndex] ?? workingCards[workingIndex] ?? earlierCards[earlierIndex];
    if (!card) return null;
    setScanCards((current) => applyPass(current, id));
    setWorkingCards((current) => applyPass(current, id));
    setEarlierCards((current) => applyPass(current, id));
    return { card, scanIndex, workingIndex, earlierIndex };
  }

  function restore(snapshot: { card: BoardCard; scanIndex: number; workingIndex: number; earlierIndex: number }) {
    if (snapshot.scanIndex >= 0) setScanCards((current) => restoreCard(current, snapshot.card, snapshot.scanIndex));
    if (snapshot.workingIndex >= 0) setWorkingCards((current) => restoreCard(current, snapshot.card, snapshot.workingIndex));
    if (snapshot.earlierIndex >= 0) setEarlierCards((current) => restoreCard(current, snapshot.card, snapshot.earlierIndex));
  }

  async function pass(id: string) {
    const snapshot = remove(id);
    if (!snapshot) return;
    setProblem(null);
    setNote("Passing…");
    try {
      const response = await fetch("/api/opportunities/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "pass" }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        restore(snapshot);
        setNote(null);
        setProblem(body.message || "Pass did not save. The card is back.");
        return;
      }
      setNote("Passed. The card left this list. The rest of the desk was not reloaded.");
    } catch {
      restore(snapshot);
      setNote(null);
      setProblem("The desk could not reach the server. The card is back.");
    }
  }

  return (
    <div className="space-y-10">
      {problem ? <p className="border border-stamp px-3 py-3 text-sm">{problem}</p> : null}
      {note ? <p className="text-sm">{note}</p> : null}
      <section>
        <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">This scan</p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">What this scan understood.</h2>
        {scanCards.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">This scan has no open cards. Earlier discoveries stay on Investigate. They were not deleted.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {scanCards.map((card, index) => (
              <Card key={card.id} card={{ ...card, displayNumber: index + 1 }} from={place} onPass={() => void pass(card.id)} />
            ))}
          </ol>
        )}
      </section>
      <section id="working">
        <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Working</p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Stories already open.</h2>
        {workingCards.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Nothing is in progress. Starting an investigation from a story puts it here, across every scan and pillar.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workingCards.map((card) => (
              <Card key={card.id} card={card} from="working" onPass={() => void pass(card.id)} />
            ))}
          </ul>
        )}
      </section>
      {earlierCards.length > 0 ? (
        <section>
          <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Earlier discoveries</p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Saved from earlier scans.</h2>
          <p className="mt-2 text-sm text-ink-soft">These cards stay stored. A newer scan does not remove them, and their stored ranks are unchanged.</p>
          <ul className="mt-3 space-y-3">
            {earlierCards.map((card) => (
              <Card key={card.id} card={card} from="investigate" onPass={() => void pass(card.id)} />
            ))}
          </ul>
        </section>
      ) : null}
      {passed.length > 0 ? (
        <details>
          <summary className="cursor-pointer font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Passed over</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {passed.map((card) => (
              <li key={card.id} className="border border-rule px-3 py-3">
                <p>{card.title}</p>
                <p className="mt-1 text-ink-soft">Passed. Not part of this scan.</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Card({ card, from, onPass }: { card: BoardCard; from: string; onPass: () => void }) {
  const pillar = contentPillarFromStorage(card.pillar);
  return (
    <li className="border border-rule px-4 py-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase">
        {card.displayNumber ? `#${card.displayNumber}` : "Working"}
        {card.older ? " · Earlier scan" : " · This scan"}
        {pillar ? ` · ${pillarLabels[pillar]}` : ""}
        {card.lowValue ? " · Low value" : ""}
      </p>
      <p className="mt-2 text-sm leading-relaxed">{card.title}</p>
      <p className="mt-2 text-sm">{card.storyState}</p>
      <p className="mt-1 text-sm text-ink-soft">{card.storyReason}</p>
      <p className="mt-1 text-sm">Next: {card.storyAction}</p>
      {card.sourceText ? <p className="mt-2 text-sm text-ink-soft">{card.sourceText}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <DevelopButton id={card.id} />
        <button type="button" onClick={onPass} className="inline-flex h-11 items-center border border-ink px-3 text-sm">
          Pass
        </button>
        <Link href={hrefFor(card, from)} className="inline-flex h-11 items-center px-3 text-sm underline">Open story</Link>
      </div>
    </li>
  );
}

function DevelopButton({ id }: { id: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [phase, setPhase] = useState<"idle" | "confirm" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send(action: "preview" | "start") {
    if (busy.current) return;
    busy.current = true;
    setPhase(action === "preview" ? "confirm" : "working");
    setMessage(action === "start" ? "Developing this story. Stay on this card." : null);
    try {
      const response = await fetch("/api/desk/develop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string; blocked?: boolean };
      if (action === "preview") {
        setMessage(body.message || "The preview could not be read.");
        setPhase("confirm");
        return;
      }
      setPhase("done");
      setMessage(body.message || "Development stopped.");
      router.push(`/desk/work/${id}?from=working`);
    } catch {
      setPhase("idle");
      setMessage("The desk could not reach the server. This story is still here.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="max-w-xl">
      <button type="button" disabled={phase === "working"} onClick={() => void send("preview")} className="inline-flex h-11 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50">
        {phase === "working" ? "Developing…" : "Develop content"}
      </button>
      {phase === "confirm" || phase === "done" ? (
        <div className="mt-2 border border-rule px-3 py-2">
          <p className="text-sm">{message}</p>
          {phase === "confirm" ? (
            <button type="button" onClick={() => void send("start")} className="mt-2 inline-flex h-11 items-center border border-ink px-3 text-sm">
              Confirm and open the story
            </button>
          ) : (
            <Link href={`/desk/work/${id}`} className="mt-2 inline-flex h-11 items-center underline text-sm">Open this story</Link>
          )}
        </div>
      ) : message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
