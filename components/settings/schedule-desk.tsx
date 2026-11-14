"use client";

import { useEffect, useState } from "react";

type ScheduleMode = "manual" | "every-3-hours" | "every-4-hours" | "custom";

type ScheduleState = {
  enabled: boolean;
  mode: ScheduleMode;
  customHours: number | null;
  runningSince: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
};

export function ScheduleDesk() {
  const [schedule, setSchedule] = useState<ScheduleState | null>(null);
  const [cronSecret, setCronSecret] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<ScheduleMode>("every-3-hours");
  const [customHours, setCustomHours] = useState(6);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "run" | null>("load");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setBusy("load");
    try {
      const response = await fetch("/api/schedule", { cache: "no-store" });
      const body = (await response.json()) as {
        ok?: boolean;
        schedule?: ScheduleState;
        cronSecret?: boolean;
        message?: string;
      };
      if (body.schedule) {
        setSchedule(body.schedule);
        setMode(body.schedule.mode === "manual" ? "every-3-hours" : body.schedule.mode);
        if (typeof body.schedule.customHours === "number") setCustomHours(body.schedule.customHours);
        setConfirmed(body.schedule.enabled);
      }
      setCronSecret(body.cronSecret === true);
      setMessage(body.message ?? null);
    } catch {
      setMessage("The schedule could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function save(enabled: boolean) {
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          mode,
          customHours: mode === "custom" ? customHours : null,
          editorConfirmed: confirmed,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(body.message ?? "The schedule was not saved.");
      if (body.ok) await refresh();
    } catch {
      setMessage("The schedule was not saved.");
    } finally {
      setBusy(null);
    }
  }

  async function runOnce() {
    setBusy("run");
    setMessage(null);
    try {
      const response = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(body.message ?? "The pipeline did not finish.");
      await refresh();
    } catch {
      setMessage("The pipeline did not finish.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm leading-relaxed">
        Background find → research → draft runs through <span className="font-mono text-[12px]">/api/schedule/run</span>. It never publishes. Scheduling stays off until you arm it.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">State</dt>
          <dd className="mt-1 text-sm">{schedule?.enabled ? "Armed" : "Off (default)"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">CRON_SECRET</dt>
          <dd className="mt-1 text-sm">{cronSecret ? "Set on the server" : "Missing — cron calls need it"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">Last finished</dt>
          <dd className="mt-1 text-sm">{schedule?.lastFinishedAt ?? "Never"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-ink-soft uppercase">Running</dt>
          <dd className="mt-1 text-sm">{schedule?.runningSince ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <label className="block text-sm">
        <span className="text-ink-soft">Interval</span>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as ScheduleMode)}
          className="mt-2 block w-full border border-rule bg-paper px-3 py-2"
        >
          <option value="every-3-hours">Every 3 hours</option>
          <option value="every-4-hours">Every 4 hours</option>
          <option value="custom">Custom hours</option>
        </select>
      </label>
      {mode === "custom" ? (
        <label className="block text-sm">
          <span className="text-ink-soft">Hours (3–24)</span>
          <input
            type="number"
            min={3}
            max={24}
            value={customHours}
            onChange={(event) => setCustomHours(Number(event.target.value))}
            className="mt-2 block w-full border border-rule bg-paper px-3 py-2"
          />
        </label>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I accept that an armed schedule spends X and research budget. It still cannot publish.
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={busy !== null || !confirmed}
          className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Arm schedule"}
        </button>
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={busy !== null}
          className="inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
        >
          Keep / turn off
        </button>
        <button
          type="button"
          onClick={() => void runOnce()}
          disabled={busy !== null}
          className="inline-flex h-10 items-center border border-rule px-4 text-sm disabled:opacity-50"
        >
          {busy === "run" ? "Running…" : "Run pipeline once"}
        </button>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
