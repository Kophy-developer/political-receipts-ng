"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { browserNotifyBody, browserNotifyTitle, readyBanner } from "@/lib/publisher/notify";

type UnreadPayload = {
  ok?: boolean;
  count?: number;
  items?: Array<{ id: string; title: string; body: string | null }>;
  installed?: boolean;
};

export function ReadyNotify({
  initialCount,
  markOnView = false,
}: {
  initialCount: number;
  markOnView?: boolean;
}) {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const count = liveCount ?? initialCount;
  const marked = useRef(false);
  const permissionAsked = useRef(false);

  useEffect(() => {
    if (!markOnView || marked.current || count < 1) return;
    marked.current = true;
    void fetch("/api/publisher/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).then(async (response) => {
      if (!response.ok) return;
      setLiveCount(0);
    }).catch(() => undefined);
  }, [markOnView, count]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const channel = client
      .channel("publisher-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "publisher_notifications" }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };

    async function refresh() {
      try {
        const response = await fetch("/api/publisher/notifications", { cache: "no-store" });
        const body = (await response.json()) as UnreadPayload;
        if (!response.ok || typeof body.count !== "number") return;
        setLiveCount(body.count);
        if (body.count > 0 && typeof document !== "undefined" && document.visibilityState === "hidden") {
          maybeBrowserNotify(body.count);
        }
      } catch {
        return;
      }
    }
  }, []);

  function maybeBrowserNotify(next: number) {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(browserNotifyTitle(next), { body: browserNotifyBody(next), tag: "prng-ready" });
      return;
    }
    if (Notification.permission === "default" && !permissionAsked.current) {
      permissionAsked.current = true;
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted" && document.visibilityState === "hidden") {
          new Notification(browserNotifyTitle(next), { body: browserNotifyBody(next), tag: "prng-ready" });
        }
      });
    }
  }

  const message = readyBanner(count);
  if (!message) return null;
  return (
    <div className="mb-6 border border-ink bg-ink px-4 py-3 text-sm text-paper" role="status">
      {message}
    </div>
  );
}

export function ApproveBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-sm bg-stamp px-1.5 font-mono text-[10px] text-ink">
      {count > 9 ? "9+" : count}
    </span>
  );
}
