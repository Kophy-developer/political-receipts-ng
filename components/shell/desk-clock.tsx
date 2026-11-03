"use client";

import { useEffect, useState } from "react";

export function DeskClock({ tone = "paper" }: { tone?: "paper" | "ink" }) {
  const [label, setLabel] = useState("WAT");

  useEffect(() => {
    const format = () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lagos",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());

    const update = () => setLabel(`${format()} WAT`);
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p
      className={
        tone === "ink"
          ? "font-mono text-[11px] tracking-[0.08em] text-white/55"
          : "font-mono text-[11px] tracking-[0.08em] text-ink-soft"
      }
    >
      {label}
    </p>
  );
}
