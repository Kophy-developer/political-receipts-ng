"use client";

import { useState } from "react";

export function FindEvidence() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center border border-ink px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors hover:bg-ink hover:text-paper"
      >
        Find evidence
      </button>
      {open ? (
        <p className="mt-3 max-w-xl text-sm leading-relaxed">
          The research engine is the next stage. This button does not search the web, and it does not ask the model to invent a source, a statistic, or a quotation.
        </p>
      ) : null}
    </div>
  );
}
