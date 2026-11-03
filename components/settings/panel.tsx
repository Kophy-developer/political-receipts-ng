"use client";

import { useState } from "react";
import Link from "next/link";
import type { SystemHealth } from "@/lib/desk/types";
import { lagosStamp } from "@/lib/format";
import { editor, xCallbackPath } from "@/lib/system";
import { xProductionOrigin } from "@/lib/x/public";
import { XDesk, type XFlags } from "@/components/settings/x-desk";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/shell/page-frame";
import { SectionHeading } from "@/components/marks";

const sections = [
  { href: "#system", label: "System" },
  { href: "#x", label: "X Integration" },
  { href: "#ai", label: "AI Provider" },
  { href: "#sources", label: "Sources" },
  { href: "#rules", label: "Editorial Rules" },
  { href: "#publishing", label: "Publishing" },
  { href: "#account", label: "Account" },
];

export function SettingsPanel({ flags, health }: { flags: XFlags; health: SystemHealth }) {
  const [origin, setOrigin] = useState(xProductionOrigin);

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <SectionHeading
          kicker="Settings"
          title="The gate in front of X"
          dek="Credentials stay on the server. An account counts as connected only after a check, and a post leaves only after a person confirms the text."
        />
        <div className="grid gap-8 xl:grid-cols-[180px_minmax(0,1fr)]">
          <nav className="hidden xl:block" aria-label="Settings sections">
            <ul className="sticky top-8 space-y-2">
              {sections.map((section) => (
                <li key={section.href}>
                  <a href={section.href} className="text-sm text-ink-soft hover:text-ink">
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-12">
            <Section id="system" kicker="System" title="What the server can see">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Health label="Supabase" value={health.supabaseConfigured ? "Configured" : "Not configured"} />
                <Health label="Database" value={health.databaseReachable ? "Reachable" : "Unreachable"} />
                <Health label="Schema" value={health.schema === "present" ? "Present" : health.schema === "missing" ? "Migration not applied" : "Unknown"} />
                <Health label="X credentials" value={health.xCredentials ? "Configured" : "Missing"} />
                <Health label="X account" value={health.xAccount.username ? `@${health.xAccount.username}` : health.xAccount.status} />
                <Health label="Last X verification" value={health.xAccount.lastVerified ? lagosStamp(health.xAccount.lastVerified) : "Not verified"} />
                <Health label="Token encryption" value={health.encryptionKey ? "Key present" : "Missing"} />
                <Health label="AI provider" value={health.ai} />
                <Health label="Monitoring" value={health.monitoring} />
              </dl>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
                No secret is shown here. A stored X connection means ciphertext is in the database, not that this page can read the token. Gemini is not integrated. Automated monitoring has not started.
              </p>
            </Section>
            <Section id="x" kicker="X Integration" title="The account that can post">
              <XDesk flags={flags} />
            </Section>
            <Section id="ai" kicker="AI Provider" title="Gemini">
              <p className="text-sm leading-relaxed text-ink-soft">
                Status: <span className="text-ink">Not integrated</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed">
                When a model is added, it will draft on the server from the evidence pack. It will not approve, and it will not post. The key belongs in GEMINI_API_KEY on the server.
              </p>
              <div className="mt-4 grid max-w-lg gap-3">
                <Field label="Provider" value="Gemini" />
                <Field label="Model placeholder" value="Not configured" />
                <label className="block text-sm">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">API key</span>
                  <Input disabled className="mt-1 rounded-none" placeholder="Server environment only" />
                </label>
              </div>
            </Section>
            <Section id="sources" kicker="Sources" title="The citation policy">
              <p className="max-w-2xl text-sm leading-relaxed">
                Source classes live on the sources desk. Parties, campaigns, and candidates are not on that list and will not be added as trusted institutions.
              </p>
              <Link href="/sources" className="mt-4 inline-block text-sm underline decoration-rule underline-offset-4 hover:decoration-stamp">
                Open source library
              </Link>
            </Section>
            <Section id="rules" kicker="Editorial Rules" title="How a stamp is earned">
              <ul className="max-w-2xl space-y-3 text-sm leading-relaxed">
                <li>#CheckAm is the default for a fact-check.</li>
                <li>#ShowYourWorking is for a post whose value is the method and the denominator.</li>
                <li>#NotTrue is used only when strong evidence clearly contradicts the claim.</li>
                <li>Verified, Needs Context, and Unverified are allowed to stay less certain than a cleaner headline.</li>
                <li>No political party is a trusted source.</li>
                <li>A human editor approves every post. The model, when it exists, prepares. It does not publish.</li>
              </ul>
            </Section>
            <Section id="publishing" kicker="Publishing" title="The gate">
              <ul className="max-w-2xl space-y-3 text-sm leading-relaxed">
                <li>The pre-publication checklist must be complete before the server will accept a post.</li>
                <li>Approve and post opens a preview. X is called only after a second, explicit confirmation of that text.</li>
                <li>Schedule later is a hold on the desk, not a queued publish.</li>
                <li>Reject keeps the package off the approve button until the editor undoes it.</li>
              </ul>
            </Section>
            <Section id="account" kicker="Account" title="Who is on duty">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full border border-rule font-mono">{editor.initials}</span>
                <div>
                  <p className="font-serif text-xl">{editor.name}</p>
                  <p className="text-sm text-ink-soft">
                    {editor.role} · {editor.desk} · sample desk
                  </p>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
                Access control is not enabled. Anyone with the URL can open this demonstration. Do not treat it as a private newsroom until authentication is added.
              </p>
              <OriginField origin={origin} onChange={setOrigin} />
            </Section>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-ink pt-6">
      <p className="font-mono text-[11px] tracking-[0.16em] text-stamp uppercase">{kicker}</p>
      <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule px-3 py-3">
      <dt className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-sm">
      <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">{label}</span>
      <Input disabled value={value} className="mt-1 rounded-none" readOnly />
    </label>
  );
}

function OriginField({ origin, onChange }: { origin: string; onChange: (value: string) => void }) {
  return (
    <div className="mt-5 max-w-xl">
      <p className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Addresses for the X portal</p>
      <label className="mt-3 block text-sm">
        <span>Production origin</span>
        <Input
          value={origin}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 rounded-none"
          aria-label="Production origin"
        />
      </label>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        Website URL: {origin || "—"}
        <br />
        Callback URL: {origin ? `${origin.replace(/\/$/, "")}${xCallbackPath}` : "—"}
      </p>
      <p className="mt-2 text-xs text-ink-soft">This field is a local note. It is not saved.</p>
    </div>
  );
}
