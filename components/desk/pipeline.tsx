"use client";

import { useState } from "react";
import { contentPillarFromStorage, contentPillars, pillarLabels, type ContentPillar } from "@/lib/pillars/catalog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chicagoStamp } from "@/lib/format";
import {
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
  limitation?: string | null;
  drafts?: string[];
};

export function EditorialPipeline({
  ready,
  queue,
  earlier,
  history,
  migrationPending,
}: {
  ready: ReadyItem[];
  queue: PipelineCard[];
  earlier: PipelineCard[];
  history: PipelineCard[];
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
                {item.limitation ? <p className="mt-2 text-sm">Unresolved: {item.limitation}</p> : null}
                {item.drafts && item.drafts.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {item.drafts.map((draft) => (
                      <li key={draft} className="border border-rule px-3 py-2 whitespace-pre-wrap">{draft}</li>
                    ))}
                  </ul>
                ) : null}
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
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Understood content.</h2>
        <p className="mt-2 text-sm text-ink-soft">This is the active understanding inbox. Order comes from the signals. Names of people and parties do not move an item up or down.</p>
        <p className="mt-2 text-sm">Recovered from 1 previous AI model response.</p>
        <p className="text-sm">New model requests during recovery: 0.</p>
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
          <p className="mt-4 text-sm text-ink-soft">Nothing understood is in the queue yet. Understand the saved conversations when you want an inbox from the posts already stored.</p>
        ) : (
          <>
            <ol className="mt-4 space-y-3">
              {ranked.filter((item) => !item.lowValue).map((item) => (
                <QueueItem key={item.id} item={item} busy={busy === item.id} onPass={() => void post("/api/opportunities/decision", { id: item.id, action: "pass" }, item.id)} />
              ))}
            </ol>
            {ranked.some((item) => item.lowValue) ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm">Low value</summary>
                <p className="mt-2 text-sm text-ink-soft">Understood rhetoric or insult. Kept here, and kept separate from research and drafting.</p>
                <ol className="mt-3 space-y-3">
                  {ranked.filter((item) => item.lowValue).map((item) => (
                    <QueueItem key={item.id} item={item} busy={busy === item.id} onPass={() => void post("/api/opportunities/decision", { id: item.id, action: "pass" }, item.id)} />
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        )}
        {history.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm">Previous assessment versions</summary>
            <p className="mt-2 text-sm text-ink-soft">Older cards from earlier readings. They are not current opportunities.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {history.map((item) => (
                <li key={item.id} className="border border-rule px-3 py-3">
                  <p>{item.title}</p>
                  <p className="mt-1 text-ink-soft">{typeLabel(item.type)} · version {item.version ?? "earlier"} · not current</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {earlier.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm">Earlier claim-first cards</summary>
            <p className="mt-2 text-sm text-ink-soft">These are not part of the active understanding inbox.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {earlier.map((item) => (
                <li key={item.id} className="border border-rule px-3 py-3">
                  <p>{item.title}</p>
                  <p className="mt-1 text-ink-soft">{typeLabel(item.type)} · kept from an earlier pass</p>
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
        <p className="mt-3 text-sm text-ink-soft">Only a conversation the reader could not understand is passed over. Promoting one is an editor decision. It does not call a model.</p>
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

function QueueItem({ item, busy, onPass }: { item: PipelineCard; busy: boolean; onPass: () => void }) {
  const pillar = pillarLabels[contentPillarFromStorage(item.pillar) ?? "politics"];
  const kind = item.primaryKind ? item.primaryKind.replaceAll("_", " ") : typeLabel(item.type);
  const routes = item.routes.length > 0 ? item.routes.join(", ") : item.angle;
  return (
    <li className="border border-rule px-4 py-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase">#{item.rank} · {pillar}</p>
      <p className="mt-2 text-sm leading-relaxed">{item.title}</p>
      {item.premises.length > 0 ? <p className="mt-2 text-sm">Factual premise: {item.premises.join(" ")}</p> : null}
      {item.review ? <p className="mt-2 text-sm">{item.review}</p> : null}
      <p className="mt-2 text-sm">Primary kind: {kind}</p>
      {routes ? <p className="mt-1 text-sm">Possible routes: {routes}</p> : null}
      <p className="mt-1 text-sm">Research need: {item.research === "yes" ? "yes" : item.research === "recommended" ? "recommended" : "no"}</p>
      {item.sourceText ? <p className="mt-2 text-sm text-ink-soft">{item.sourceText}</p> : null}
      <p className="mt-1 font-mono text-[11px] text-ink-soft">
        {item.review
          ? item.review
          : item.lowValue
            ? "Low value · not a research or drafting candidate"
            : item.primaryKind === "prediction"
              ? "Prediction · not a forecast by this desk"
              : item.research === "yes" || item.research === "recommended"
                ? "Research candidate · not ready to draft"
                : "In the queue"}
        {item.discoveredAt ? ` · Discovered ${chicagoStamp(item.discoveredAt)}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <DevelopButton id={item.id} busy={busy} />
        <button
          type="button"
          disabled={busy}
          onClick={onPass}
          className="inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50"
        >
          Pass
        </button>
      </div>
    </li>
  );
}

function DevelopButton({ id, busy }: { id: string; busy: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ message: string; blocked: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  async function send(action: "preview" | "start") {
    setWorking(true);
    setNote(null);
    try {
      const response = await fetch("/api/desk/develop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string; blocked?: boolean };
      if (action === "preview") {
        setPreview({ message: body.message || "The preview could not be read.", blocked: body.blocked !== false });
        return;
      }
      setNote(body.message || (body.ok ? "Development finished. Nothing was published." : "Development stopped. Nothing was published."));
      setPreview(null);
      if (body.ok) router.refresh();
    } catch {
      setNote("The desk could not reach the server. Nothing was called.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="max-w-xl">
      <button
        type="button"
        disabled={busy || working}
        onClick={() => void send("preview")}
        className="inline-flex h-9 items-center bg-ink px-3 text-sm text-paper disabled:opacity-50"
      >
        {working ? "Working…" : "Develop content"}
      </button>
      {preview ? (
        <div className="mt-2 border border-rule px-3 py-2">
          <p className="text-sm">{preview.message}</p>
          {preview.blocked ? null : (
            <button
              type="button"
              disabled={busy || working}
              onClick={() => void send("start")}
              className="mt-2 inline-flex h-9 items-center border border-ink px-3 text-sm disabled:opacity-50"
            >
              Start development
            </button>
          )}
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
    </div>
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
