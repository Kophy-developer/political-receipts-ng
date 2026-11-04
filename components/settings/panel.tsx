"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SystemHealth, UsageView } from "@/lib/desk/types";
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
  { href: "#usage", label: "Usage" },
  { href: "#sources", label: "Sources" },
  { href: "#rules", label: "Editorial Rules" },
  { href: "#publishing", label: "Publishing" },
  { href: "#account", label: "Account" },
];

type HealthResult = { ok: boolean; model: string | null; message: string; called: boolean };
type ReprocessResult = {
  ok: boolean;
  xRequests: number;
  posts: number;
  actionable: number;
  discussion: number;
  noise: number;
  conversations: number;
  claimsExtracted: number;
  claimsRejected: number;
  geminiCalls: number;
  detail: string;
  model: string | null;
  posted: false;
  polling: false;
};

export function SettingsPanel({ flags, health, usage }: { flags: XFlags; health: SystemHealth; usage: UsageView }) {
  const router = useRouter();
  const [origin, setOrigin] = useState(xProductionOrigin);
  const [checking, setChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<ReprocessResult | null>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);

  async function checkModel() {
    setChecking(true);
    setHealthError(null);
    try {
      const response = await fetch("/api/intel/gemini", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await response.json()) as HealthResult;
      setHealthResult(body);
      if (!response.ok && !body.message) setHealthError("The model check did not finish.");
    } catch {
      setHealthError("The model check did not finish.");
    } finally {
      setChecking(false);
    }
  }

  async function reprocess() {
    setReprocessing(true);
    setReprocessError(null);
    try {
      const response = await fetch("/api/intel/reprocess", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await response.json()) as ReprocessResult;
      setReprocessResult(body);
      if (!body.ok && body.detail) setReprocessError(body.detail);
      router.refresh();
    } catch {
      setReprocessError("Reprocessing did not finish. No X request was sent from this page.");
    } finally {
      setReprocessing(false);
    }
  }

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
                No secret is shown here. A stored X connection means ciphertext is in the database, not that this page can read the token. Gemini extracts claims only when a scan asks it to. Nothing polls X.
              </p>
              {health.missingTables.length > 0 ? (
                <p className="mt-3 max-w-2xl text-sm">Still to install: {health.missingTables.join(", ")}.</p>
              ) : null}
            </Section>
            <Section id="x" kicker="X Integration" title="The account that can post">
              <XDesk flags={flags} />
            </Section>
            <Section id="ai" kicker="AI Provider" title="Gemini">
              <p className="text-sm leading-relaxed text-ink-soft">
                Status: <span className="text-ink">{health.ai}</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed">
                Gemini reads posts a scan already retrieved and returns candidate claims as JSON. The desk drops a claim if a number, quotation, or source is not in the post. The model does not verify, rank candidates, or post. Drafting public copy is still off. The key stays in GEMINI_API_KEY.
              </p>
              <div className="mt-4 grid max-w-lg gap-3">
                <Field label="Provider" value="Gemini" />
                <Field label="Model" value={health.model ?? "Not configured"} />
                <label className="block text-sm">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">API key</span>
                  <Input disabled className="mt-1 rounded-none" placeholder="Server environment only" />
                </label>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
                The model name comes from the server. Set GEMINI_MODEL there to override the default. The check below only asks whether the model can return a short JSON object. It does not send a post or a political prompt.
              </p>
              <button
                type="button"
                onClick={checkModel}
                disabled={checking}
                className="mt-4 inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check model availability"}
              </button>
              {healthResult ? (
                <p className="mt-3 max-w-2xl text-sm">
                  {healthResult.model ? `${healthResult.model}: ` : ""}
                  {healthResult.message}
                </p>
              ) : null}
              {healthError ? <p className="mt-3 text-sm text-stamp">{healthError}</p> : null}
            </Section>
            <Section id="usage" kicker="Usage" title="What today has cost">
              <p className="max-w-2xl text-sm leading-relaxed">
                Counts are for the Lagos day ({usage.dayLabel}). A scan stops when a daily ceiling is hit. It does not retry a failed paid call.
              </p>
              {usage.installed ? (
                <>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Health label="X requests" value={`${usage.xRequests} / ${usage.xRequestLimit}`} />
                  <Health label="Posts retrieved" value={`${usage.posts} / ${usage.postLimit}`} />
                  <Health label="Gemini requests" value={`${usage.geminiRequests} / ${usage.geminiLimit}`} />
                  <Health label="Gemini tokens" value={`${usage.inputTokens ?? 0} in · ${usage.outputTokens ?? 0} out`} />
                  <Health label="Last scan" value={usage.lastDuration ?? "No scan yet"} />
                  <Health label="Search groups" value={String(usage.groups)} />
                  <Health label="Per scan" value={`${usage.perScanRequests} request · ${usage.perScanPosts} posts · ${usage.lookbackHours}h`} />
                  <Health label="Minimum engagement" value={String(usage.minEngagement)} />
                  <Health label={`X spend today (${usage.spendLabel})`} value={usage.estimatedXSpendToday} />
                  <Health label={`X spend all time (${usage.spendLabel})`} value={usage.estimatedXSpendAll} />
                  <Health label="Research searches" value={`${usage.searches} / ${usage.searchLimit}`} />
                  <Health label="Documents retrieved" value={`${usage.retrievals} / ${usage.retrievalLimit}`} />
                  <Health label="Search provider" value={usage.searchProvider} />
                </dl>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">{usage.spendNote}</p>
                {usage.searchCredential ? (
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed">
                    Research search is off until {usage.searchCredential} is set on the server. No search is sent without it, and the key is not shown here.
                  </p>
                ) : (
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
                    {usage.searchProvider} is configured. A search still waits for Begin research on a claim.
                  </p>
                )}
                <div className="mt-6 max-w-3xl">
                  <h3 className="font-serif text-xl">Research this billing period</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">Period starting {usage.researchPeriod}. {usage.researchCostNote}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Health label="Tavily used this period" value={String(usage.tavilyUsed)} />
                    <Health label="Tavily remaining" value={String(usage.tavilyRemaining)} />
                    <Health label="Tavily monthly ceiling" value={String(usage.tavilyCeiling)} />
                    <Health label="Tavily key" value={usage.tavilyConfigured ? "Set on the server" : "TAVILY_API_KEY is not set"} />
                    <Health label="Brave used this period" value={String(usage.braveUsed)} />
                    <Health label="Brave remaining" value={String(usage.braveRemaining)} />
                    <Health label="Brave monthly ceiling" value={String(usage.braveCeiling)} />
                    <Health label="Brave key" value={usage.braveConfigured ? "Set on the server" : "BRAVE_API_KEY is not set"} />
                    <Health label="Research runs" value={String(usage.researchRuns)} />
                    <Health label="Documents retrieved" value={String(usage.researchDocuments)} />
                  </dl>
                  <p className="mt-3 text-sm leading-relaxed">
                    Tavily is primary. Brave is used when Tavily is missing, over its ceiling, or not answering, and when you click Search second provider. A weak result does not switch by itself. When both ceilings are spent, research stops.
                  </p>
                </div>
                <div className="mt-6 max-w-2xl">
                  <p className="text-sm leading-relaxed">
                    Reprocess stored posts with the current relevance and clustering rules, then run claim extraction on what is already saved. This does not call X.
                  </p>
                  <button
                    type="button"
                    onClick={reprocess}
                    disabled={reprocessing}
                    className="mt-3 inline-flex h-10 items-center bg-ink px-4 text-sm text-paper disabled:opacity-50"
                  >
                    {reprocessing ? "Reprocessing…" : "Reprocess stored posts"}
                  </button>
                  {reprocessResult ? (
                    <dl className="mt-4 grid grid-cols-2 gap-2 border border-rule p-3 font-mono text-[11px]">
                      <div>X requests {reprocessResult.xRequests}</div>
                      <div>Posts {reprocessResult.posts}</div>
                      <div>Actionable {reprocessResult.actionable}</div>
                      <div>Discussion {reprocessResult.discussion}</div>
                      <div>Noise {reprocessResult.noise}</div>
                      <div>Conversations {reprocessResult.conversations}</div>
                      <div>Claims extracted {reprocessResult.claimsExtracted}</div>
                      <div>Claims rejected {reprocessResult.claimsRejected}</div>
                      <div>Gemini calls {reprocessResult.geminiCalls}</div>
                      <div>Posted {reprocessResult.posted ? "yes" : "no"}</div>
                      <div className="col-span-2">{reprocessResult.detail}</div>
                    </dl>
                  ) : null}
                  {reprocessError ? <p className="mt-3 text-sm text-stamp">{reprocessError}</p> : null}
                </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-ink-soft">Usage tracking is not installed yet. Apply the intelligence migration. No scan will call X until it is.</p>
              )}
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
                <li>#NotTrue is used only when accepted evidence contradicts a factual claim at high confidence. An opinion does not qualify.</li>
                <li>Politics, Manchester United, and finance share one voice. Their source lists do not.</li>
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
