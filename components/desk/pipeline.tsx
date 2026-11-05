"use client";

import { useState } from "react";
import { contentPillarFromStorage, contentPillars, pillarLabels, type ContentPillar } from "@/lib/pillars/catalog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chicagoStamp } from "@/lib/format";
import {
  lifecycleLabel,
  priorityLabel,
  researchLabel,
  typeLabel,
  type PipelineCard,
} from "@/lib/editorial/present";

export type ReadyItem = {
  id: string;
  kind: "claim" | "opportunity";
  title: string;
  text: string;
  type: string;
  why: string;
  evidence: string | null;
  sources: string[];
  count: number;
  shape: string;
  href: string;
};

export function EditorialPipeline({
  ready,
  queue,
  earlier,
  migrationPending,
}: {
  ready: ReadyItem[];
  queue: PipelineCard[];
  earlier: PipelineCard[];
  migrationPending: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function post(path: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setNote(payload.message || (payload.ok ? "Saved." : "That did not save."));
      if (payload.ok) router.refresh();
    } catch {
      setNote("The desk could not reach the server. Nothing was sent.");
    } finally {
      setBusy(null);
    }
  }

  const [filter, setFilter] = useState<"all" | ContentPillar>("all");
  const ranked = queue
    .filter((item) => filter === "all" || (contentPillarFromStorage(item.pillar) ?? "politics") === filter)
    .slice()
    .sort((left, right) => (left.rank ?? 99) - (right.rank ?? 99));

  return (
    <div className="space-y-10">
      <section>
        <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Ready for you</p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Drafts awaiting an editor.</h2>
        <p className="mt-2 text-sm text-ink-soft">This is the decision. Edit, pass, or open the publish gate. The gate sends the exact saved text.</p>
        {ready.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Nothing is waiting on you. Ranked items stay in the queue until a draft is prepared.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {ready.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="border border-ink px-4 py-4">
                <p className="font-mono text-[11px] tracking-[0.14em] uppercase">{item.type}</p>
                <h3 className="mt-2 font-serif text-2xl leading-snug">{item.title}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p>
                <p className="mt-3 text-sm">{item.why}</p>
                {item.evidence ? <p className="mt-2 text-sm text-ink-soft">{item.evidence}</p> : null}
                {item.sources.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {item.sources.map((source) => (
                      <li key={source}><a className="underline" href={source}>{source}</a></li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 font-mono text-[11px] text-ink-soft">{item.count} characters · {item.shape}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={item.href} className="inline-flex h-10 items-center border border-ink px-3 text-sm">Edit</Link>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void post(
                      item.kind === "claim" ? "/api/desk/pass" : "/api/opportunities/decision",
                      item.kind === "claim" ? { claimId: item.id } : { id: item.id, action: "pass" },
                      item.id,
                    )}
                    className="inline-flex h-10 items-center border border-ink px-3 text-sm disabled:opacity-50"
                  >
                    Pass
                  </button>
                  <Link href={`${item.href}#publish`} className="inline-flex h-10 items-center bg-ink px-3 text-sm text-paper">Publish</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Content queue</p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Ranked opportunities.</h2>
        <p className="mt-2 text-sm text-ink-soft">Every conversation worth talking about stays here. A higher rank does not discard the others. The mix does not move a weaker post above a stronger one.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Queue pillar">
          <FilterButton pressed={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
          {contentPillars.map((pillar) => (
            <FilterButton key={pillar} pressed={filter === pillar} onClick={() => setFilter(pillar)}>{pillarLabels[pillar]}</FilterButton>
          ))}
        </div>
        {migrationPending ? (
          <p className="mt-4 text-sm">The queue columns are not on this database yet. Earlier cards are still kept. Reassess will wait until the editorial migration is applied.</p>
        ) : null}
        {ranked.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">No ranked opportunities yet. Reassess the saved conversations when you want a queue from the posts already stored.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {ranked.map((item) => (
              <li key={item.id} className="border border-rule px-4 py-4">
                <p className="font-mono text-[11px] tracking-[0.14em] uppercase">#{item.rank} [{typeLabel(item.type)}] {pillarLabels[contentPillarFromStorage(item.pillar) ?? "politics"]}</p>
                <p className="mt-2 text-sm leading-relaxed">{item.title}</p>
                <p className="mt-2 text-sm text-ink-soft">{item.angle}</p>
                <p className="mt-2 text-sm">{researchLabel(item.research)} · {priorityLabel(item.priority)}</p>
                <p className="mt-1 font-mono text-[11px] text-ink-soft">
                  Timeliness {item.timeliness ?? "not set"}
                  {item.discoveredAt ? ` · Discovered ${chicagoStamp(item.discoveredAt)}` : ""}
                  {item.lifecycle ? ` · ${lifecycleLabel(item.lifecycle)}` : ""}
                </p>
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => void post("/api/opportunities/decision", { id: item.id, action: "pass" }, item.id)}
                  className="mt-3 inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50"
                >
                  Pass
                </button>
              </li>
            ))}
          </ol>
        )}
        {earlier.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm">Earlier claim-first cards</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {earlier.map((item) => (
                <li key={item.id} className="border border-rule px-3 py-3">
                  <p>{item.title}</p>
                  <p className="mt-1 text-ink-soft">{typeLabel(item.type)} · kept from the previous assessment</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {note ? <p className="text-sm">{note}</p> : null}
    </div>
  );
}

export function PassedOver({ passed }: { passed: PipelineCard[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function promote(id: string) {
    setBusy(id);
    setNote(null);
    try {
      const response = await fetch("/api/opportunities/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "promote" }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setNote(payload.message || (payload.ok ? "Moved into the queue." : "That did not save."));
      if (payload.ok) router.refresh();
    } catch {
      setNote("The desk could not reach the server. Nothing was sent.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <details>
        <summary className="cursor-pointer font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Passed over</summary>
        <p className="mt-3 text-sm text-ink-soft">Weak material stays collapsed. Promoting one is an editor decision. It does not call a model.</p>
        {passed.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing has been passed over.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {passed.map((item) => (
              <li key={item.id} className="border border-rule px-4 py-3">
                <p className="text-sm leading-relaxed">{item.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{item.passReason || item.reason}</p>
                <button
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => void promote(item.id)}
                  className="mt-3 inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50"
                >
                  Promote to content queue
                </button>
              </li>
            ))}
          </ul>
        )}
        {note ? <p className="mt-3 text-sm">{note}</p> : null}
      </details>
    </section>
  );
}

function FilterButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-8 items-center border px-2.5 text-sm ${pressed ? "border-ink bg-ink text-paper" : "border-rule"}`}
    >
      {children}
    </button>
  );
}
