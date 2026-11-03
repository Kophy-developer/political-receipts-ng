"use client";

import { useState } from "react";
import Link from "next/link";
import { editor, xCallbackPath } from "@/lib/system";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/shell/page-frame";
import { SampleNote, SectionHeading } from "@/components/marks";

const sections = [
  { href: "#x", label: "X Integration" },
  { href: "#ai", label: "AI Provider" },
  { href: "#sources", label: "Sources" },
  { href: "#rules", label: "Editorial Rules" },
  { href: "#publishing", label: "Publishing" },
  { href: "#account", label: "Account" },
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("https://[your-vercel-domain]");

  return (
    <PageFrame>
      <div className="desk-in flex flex-col gap-8">
        <SectionHeading
          kicker="Settings"
          title="Connections, still closed"
          dek="Placeholders for the credentials this desk will need later. Nothing typed here is stored, and no secret is shipped to the browser."
        />
        <SampleNote />
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
            <Section id="x" kicker="X Integration" title="The account that would post">
              <p className="text-sm leading-relaxed text-ink-soft">
                Status: <span className="text-ink">Not Connected</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed">
                OAuth is not configured. The callback route exists so the developer portal has an address to point at. It does not exchange codes.
              </p>
              <p className="mt-3 break-all font-mono text-xs text-ink-soft">
                Callback path {xCallbackPath}
              </p>
              <Button type="button" className="mt-4 h-10" onClick={() => setOpen(true)}>
                Connect X Account
              </Button>
            </Section>
            <Section id="ai" kicker="AI Provider" title="Gemini">
              <p className="text-sm leading-relaxed text-ink-soft">
                Status: <span className="text-ink">Not Configured</span>
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
                <li>The pre-publication checklist must be complete before approval is even offered as a real send.</li>
                <li>In this build, approval records a note and opens a warning. It does not call X.</li>
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">X is not connected</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ink-soft">
              X authentication is not configured. This demo cannot authorise an account or publish a post. Add the server credentials when you are ready. Nothing in this dialog starts an OAuth flow.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Status: <span className="font-medium">Not Connected</span>
          </p>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
