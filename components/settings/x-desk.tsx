"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { xCallbackUrl } from "@/lib/x/public";
import { cn } from "cn";

export type XFlags = {
  configured: boolean;
  oauth2: boolean;
  oauth1: boolean;
};

type Check = {
  connected: boolean;
  username: string;
  name: string;
  method: string;
  read: boolean;
  write: "not_exercised";
  checkedAt: string;
};

const reasons: Record<string, string> = {
  denied: "X did not grant access. No token was stored.",
  state: "The sign-in state did not match. Start the connection again. No token was stored.",
  exchange: "X did not complete the code exchange. No token was stored.",
  config: "The server is missing the OAuth client credentials.",
  identity: "X authorised the app, but the desk could not read the account. The token was discarded.",
  encrypt: "The server has no encryption key, so the tokens were not stored.",
  store: "The account was identified, but the desk could not store the connection. The tokens were not kept.",
};

function safeHandle(value: string | null) {
  if (!value || !/^[A-Za-z0-9_]{1,15}$/.test(value)) return null;
  return value;
}

function lagosStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)} WAT`;
}

export function XDesk({ flags }: { flags: XFlags }) {
  const params = useSearchParams();
  const handshake = params.get("x") === "handshake" ? safeHandle(params.get("handle")) : null;
  const reason = params.get("x") && params.get("x") !== "handshake" ? reasons[params.get("x") ?? ""] : null;
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function testConnection() {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/x/connection", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as Partial<Check> & { message?: string; ok?: boolean };
      if (!response.ok || !data.ok || !data.username || !data.name || !data.checkedAt) {
        setCheck(null);
        setError(typeof data.message === "string" ? data.message.slice(0, 180) : "The connection check failed.");
        return;
      }
      setCheck({
        connected: true,
        username: data.username,
        name: data.name,
        method: data.method || "OAuth 1.0a user context",
        read: true,
        write: "not_exercised",
        checkedAt: data.checkedAt,
      });
    } catch {
      setCheck(null);
      setError("The desk could not reach the connection check.");
    } finally {
      setChecking(false);
    }
  }

  const verified = Boolean(check?.connected);
  const publishing = verified && flags.oauth1;

  return (
    <div className="max-w-2xl">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Status label="API credentials" value={flags.configured ? "Configured" : "Missing"} on={flags.configured} />
        <Status label="Account check" value={verified ? "Verified" : "Not verified"} on={verified} />
        <Status label="Publishing" value={publishing ? "Enabled" : "Closed"} on={publishing} />
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        Credentials on the server are not a connection. The account is verified only when you run the check below. That check reads the profile. It does not post, like, repost, follow, or delete.
      </p>
      <div className="mt-4 border border-rule bg-paper px-4 py-4">
        <p className="font-mono text-[10px] tracking-[0.16em] text-ink-soft uppercase">OAuth 1.0a account</p>
        <p className="mt-2 text-sm">
          Status: <span className="text-ink">{verified ? "Connected" : "Not connected"}</span>
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Username" value={check ? `@${check.username}` : "—"} />
          <Row label="Display name" value={check?.name ?? "—"} />
          <Row label="Connection method" value={check?.method ?? "OAuth 1.0a user context"} />
          <Row label="Read permission" value={check?.read ? "Verified on this check" : "Not verified"} />
          <Row label="Write permission" value={check ? "Not exercised. No post was sent." : "Not tested"} />
          <Row label="Last connection check" value={check ? lagosStamp(check.checkedAt) : "—"} />
        </dl>
        {error ? <p className="mt-3 text-sm text-stamp">{error}</p> : null}
        <Button type="button" className="mt-4 h-10" disabled={!flags.oauth1 || checking} onClick={testConnection}>
          {checking ? "Checking…" : "Test connection"}
        </Button>
        {!flags.oauth1 ? (
          <p className="mt-2 text-xs text-ink-soft">The OAuth 1.0a credentials are not present on the server.</p>
        ) : null}
      </div>
      <div className="mt-4 border border-rule px-4 py-4">
        <p className="font-mono text-[10px] tracking-[0.16em] text-ink-soft uppercase">OAuth 2.0 with PKCE</p>
        <p className="mt-2 text-sm leading-relaxed">
          Connect X Account starts an authorisation-code flow for tweet.read, tweet.write, users.read, and offline.access. Direct messages are not requested. The callback validates state, exchanges the code, and stores the tokens only as server-side ciphertext.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Storage needs the server encryption key. Without it, the handshake still names the account and then drops the tokens.
        </p>
        {handshake ? (
          <p className="mt-3 text-sm">
            This visit identified @{handshake}. If the encryption key is set, the connection is stored on the server. The tokens are not in this page.
          </p>
        ) : null}
        {reason ? <p className="mt-3 text-sm text-stamp">{reason}</p> : null}
        {flags.oauth2 ? (
          <a href="/api/auth/x/start" className={cn(buttonVariants(), "mt-4 h-10")}>
            Connect X Account
          </a>
        ) : (
          <Button type="button" className="mt-4 h-10" disabled>
            Connect X Account
          </Button>
        )}
        {!flags.oauth2 ? <p className="mt-2 text-xs text-ink-soft">The OAuth client id and secret are not present on the server.</p> : null}
        <p className="mt-3 break-all font-mono text-xs text-ink-soft">{xCallbackUrl}</p>
      </div>
      {publishing ? (
        <p className="mt-4 text-sm leading-relaxed">
          Publishing is enabled for an editor who completes the checklist and confirms the exact text. This check did not create a post.
        </p>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Publishing stays closed until a connection check succeeds in this session. A draft still cannot send itself.
        </p>
      )}
    </div>
  );
}

function Status({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <div className="border border-rule px-3 py-3">
      <dt className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{label}</dt>
      <dd className={cn("mt-1 text-sm", on ? "text-ink" : "text-ink-soft")}>{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
