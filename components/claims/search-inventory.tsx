"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StoredSearchResult } from "@/lib/research/inventory";

const statusLabel: Record<StoredSearchResult["retrievalStatus"], string> = {
  not_retrieved: "Not retrieved",
  retrieved: "Retrieved",
  rejected: "Rejected",
  failed: "Failed",
};

export function SearchInventory({
  claimId,
  results,
  note,
}: {
  claimId: string;
  results: StoredSearchResult[];
  note: string | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const candidates = results
    .filter((item) => item.inDomain && (item.retrievalStatus === "not_retrieved" || item.retrievalStatus === "failed"))
    .sort((left, right) => Number(right.recommended) - Number(left.recommended) || right.score - left.score || left.resultRank - right.resultRank);
  const retrieved = results.filter((item) => item.retrievalStatus === "retrieved");

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function retrieve() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/research/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, resultIds: picked }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(payload.message || (payload.ok ? "Retrieved." : "That page was not opened."));
      if (payload.ok) {
        setPicked([]);
        router.refresh();
      }
    } catch {
      setMessage("The desk could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {note ? <p className="text-sm leading-relaxed">{note}</p> : null}
      <section>
        <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Document candidates</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          These are the in-domain results ranked against the research questions. A recommendation does not open the page. Choose at most two, then retrieve them. That fetch uses the address already stored and does not run another search.
        </p>
        {candidates.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No unopened in-domain result is waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {candidates.map((item) => (
              <li key={item.id} className="border border-rule bg-paper px-3 py-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span>
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-soft">
                      {item.recommended ? "Recommended · " : ""}
                      {statusLabel[item.retrievalStatus]} · result {item.resultRank}
                    </span>
                    <span className="mt-1 block font-medium">{item.title}</span>
                    <span className="mt-1 block text-ink-soft">{item.reason || "No ranking note is stored."}</span>
                    {item.snippet ? <span className="mt-2 block leading-relaxed">{item.snippet}</span> : null}
                    <span className="mt-2 block break-all font-mono text-[11px] text-ink-soft">{item.url}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={retrieve}
          className="mt-3 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
        >
          {busy ? "Retrieving…" : "Retrieve selected"}
        </button>
        {message ? <p className="mt-3 max-w-2xl text-sm">{message}</p> : null}
      </section>
      <section>
        <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Search results</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Every address the provider returned. This list is the inventory we already paid for. It is not evidence.
        </p>
        {results.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No search inventory is stored for this claim.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {results.map((item) => (
              <li key={item.id} className="border border-rule px-3 py-3 text-sm">
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-soft">
                  {item.provider} · result {item.resultRank} · {item.inDomain ? "In domain" : "Out of domain"} · {statusLabel[item.retrievalStatus]}
                  {item.targetTier ? ` · ${item.targetTier}` : ""}
                </p>
                <p className="mt-2">{item.title}</p>
                <p className="mt-1 text-ink-soft">{item.question}</p>
                <p className="mt-1">Query: {item.query}</p>
                {item.snippet ? <p className="mt-2 leading-relaxed">{item.snippet}</p> : <p className="mt-2 text-ink-soft">No snippet was stored.</p>}
                {item.published ? <p className="mt-1 font-mono text-[11px] text-ink-soft">{item.published}</p> : null}
                {item.rejectionReason ? <p className="mt-1 text-ink-soft">{item.rejectionReason}</p> : null}
                <p className="mt-2 break-all font-mono text-[11px] text-ink-soft">{item.url}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h3 className="font-mono text-[11px] tracking-[0.16em] uppercase">Retrieved sources</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Pages the desk has opened. Opening a page still does not accept it as evidence.
        </p>
        {retrieved.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No document has been retrieved from these results.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {retrieved.map((item) => (
              <li key={item.id} className="border border-rule px-3 py-3 text-sm">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-ink-soft">{item.domain} · {item.targetTier || "Tier not recorded"}</p>
                <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all font-mono text-[11px] underline decoration-rule underline-offset-4">
                  {item.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
