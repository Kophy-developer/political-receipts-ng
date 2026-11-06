"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { providerLabels, type ProviderCard, type ProviderId } from "@/lib/ai/catalog";
import type { EditorialTrace, UnderstandTrace, UnderstandingFailureNotice } from "@/lib/editorial/trace";
import type { SystemHealth, UsageView } from "@/lib/desk/types";
import { lagosStamp } from "@/lib/format";
import type { EditorIdentity } from "@/lib/identity";
import { xCallbackPath } from "@/lib/system";
import { IdentityForm } from "@/components/settings/identity-form";
import { xProductionOrigin } from "@/lib/x/public";
import { XDesk, type XFlags } from "@/components/settings/x-desk";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/shell/page-frame";
import { SectionHeading } from "@/components/marks";

const sections = [
  { href: "#system", label: "System" },
  { href: "#x", label: "X Integration" },
  { href: "#ai", label: "AI Providers" },
  { href: "#usage", label: "Usage" },
  { href: "#sources", label: "Sources" },
  { href: "#rules", label: "Editorial Rules" },
  { href: "#publishing", label: "Publishing" },
  { href: "#identity", label: "Editor identity" },
];

export function SettingsPanel({
  flags,
  health,
  usage,
  providers,
  paidUsage,
  identity,
  editorialHistory,
  understandingFailure,
  canRecoverUnderstanding,
}: {
  flags: XFlags;
  health: SystemHealth;
  usage: UsageView;
  providers: ProviderCard[];
  paidUsage: boolean;
  identity: EditorIdentity;
  editorialHistory: Array<(EditorialTrace | UnderstandTrace) & { completedAt: string }>;
  understandingFailure: UnderstandingFailureNotice | null;
  canRecoverUnderstanding: boolean;
}) {
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
                No secret is shown here. A stored X connection means ciphertext is in the database, not that this page can read the token. Gemini extracts claims only when a scan asks it to. Nothing polls X.
              </p>
              {health.missingTables.length > 0 ? (
                <p className="mt-3 max-w-2xl text-sm">Still to install: {health.missingTables.join(", ")}.</p>
              ) : null}
            </Section>
            <Section id="x" kicker="X Integration" title="The account that can post">
              <XDesk
                flags={flags}
                account={{
                  username: health.xAccount.username,
                  subscriptionType: health.xAccount.subscriptionType,
                  subscriptionCheckedAt: health.xAccount.subscriptionCheckedAt,
                }}
              />
            </Section>
            <Section id="ai" kicker="AI Providers" title="Who can draft">
              <p className="max-w-2xl text-sm leading-relaxed">
                Drafts try Groq, then OpenRouter, then Gemini. One successful provider stops the chain. A later provider runs only when the earlier one is missing, limited, timed out, or returns unusable JSON. Keys stay on the server and are not shown here.
              </p>
              <p className="mt-3 font-mono text-sm tracking-[0.08em]">AI paid usage: {paidUsage ? "ON" : "OFF"}</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {providers.map((provider) => (
                  <ProviderCardView key={provider.id} provider={provider} />
                ))}
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
                Gemini still extracts claims from posts a scan already retrieved. That path is separate from drafting. The usage section keeps the earlier Gemini request log. This section does not rewrite it.
              </p>
              <EditorialHistory history={editorialHistory} />
              <UnderstandingFailure notice={understandingFailure} canRecover={canRecoverUnderstanding} />
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
                    When an X scan is saved and the analysis does not finish, the Desk offers Reprocess saved posts. That action reads the stored posts and does not call X.
                  </p>
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
            <Section id="identity" kicker="Editor identity" title="Who is writing">
              <IdentityForm identity={identity} />
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
                Access control is not enabled. Anyone with the URL can open this desk. Do not treat it as a private newsroom until authentication is added.
              </p>
              <OriginField origin={origin} onChange={setOrigin} />
            </Section>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function UnderstandingFailure({ notice, canRecover }: { notice: UnderstandingFailureNotice | null; canRecover: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function recover() {
    setPending(true);
    setNote(null);
    try {
      const response = await fetch("/api/intel/recover-understanding", { method: "POST" });
      const body = (await response.json()) as { message?: string };
      setNote(body.message || "Recovery did not finish.");
    } catch {
      setNote("Recovery did not finish. No model request was sent.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-4 max-w-3xl border border-rule px-3 py-3">
      <p className="text-sm">Latest understanding failure</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Every field error from the latest rejection. The model JSON stays in the server attempt log and is not shown here.
      </p>
      {notice ? (
        <p className="mt-3 text-sm leading-relaxed">{notice.explanation}</p>
      ) : (
        <p className="mt-3 text-sm">No failed understanding is stored.</p>
      )}
      {canRecover ? (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="text-sm">Recover saved understanding</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Loads the stored Groq reading for this failed attempt and its scan, then saves one new understanding version. It does not call a model, X, research, or publish. A second click does not add rows.
          </p>
          <button
            type="button"
            onClick={() => void recover()}
            disabled={pending}
            className="mt-3 inline-flex h-10 items-center border border-ink px-4 text-sm disabled:opacity-50"
          >
            {pending ? "Recovering…" : "Recover saved understanding"}
          </button>
          {note ? <p className="mt-2 text-sm">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function shownCount(value: number | null) {
  return value == null ? "not reported" : String(value);
}

function EditorialHistory({ history }: { history: Array<(EditorialTrace | UnderstandTrace) & { completedAt: string }> }) {
  return (
    <details className="mt-6 max-w-3xl border border-rule px-3 py-3">
      <summary className="cursor-pointer text-sm">Editorial assessment history</summary>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Parsed readings from successful model calls. New runs store conversation understanding. Older editorial assessments stay here for diagnostics. This is not shown on the desk. No key is stored.
      </p>
      {history.length === 0 ? (
        <p className="mt-3 text-sm">No stored editorial reading yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {history.map((item) => (
            <li key={`${item.requestId}-${item.completedAt}`} className="border border-rule px-3 py-3">
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase">{item.provider} · {item.model}</p>
              <p className="mt-2 text-sm">Request {item.requestId}{item.providerRequestId ? ` · Provider request ${item.providerRequestId}` : ""}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {item.completedAt ? lagosStamp(item.completedAt) : "Time not stored"}
                {" · "}Finish {item.finishReason ?? "not reported"}
                {" · "}Prompt {shownCount(item.inputTokens)}
                {" · "}Reasoning {shownCount(item.reasoningTokens)}
                {" · "}Completion {shownCount(item.outputTokens)}
              </p>
              {Object.keys(item.assessmentVersions).length > 0 ? (
                <p className="mt-2 text-sm">
                  Versions {Object.entries(item.assessmentVersions).map(([id, version]) => `${id.slice(0, 8)} v${version}`).join(", ")}
                </p>
              ) : null}
              {item.kind === "conversation-understand-v1" ? (
                <ul className="mt-3 space-y-2">
                  {item.parsed.conversations.map((reading) => {
                    const id = typeof reading.conversation_id === "string" ? reading.conversation_id : "unknown";
                    const understood = reading.understood === true;
                    const kind = typeof reading.primary_kind === "string" ? reading.primary_kind : "";
                    const summary = typeof reading.summary === "string" ? reading.summary : "";
                    return (
                      <li key={id} className="text-sm leading-relaxed">
                        <span className="font-mono text-[11px]">{understood ? "UNDERSTOOD" : "UNCLEAR"}</span> {id.slice(0, 8)}
                        {kind ? ` · ${kind}` : ""}
                        {summary ? ` — ${summary}` : ""}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="mt-3 space-y-2">
                  {item.parsed.assessments.map((assessment) => {
                    const id = typeof assessment.conversation_id === "string" ? assessment.conversation_id : "unknown";
                    const worth = assessment.worth_talking_about === true;
                    const reason = typeof assessment.reason === "string" ? assessment.reason : "";
                    const basis = typeof assessment.editorial_basis === "string" ? assessment.editorial_basis : "";
                    return (
                      <li key={id} className="text-sm leading-relaxed">
                        <span className="font-mono text-[11px]">Historical {worth ? "KEEP" : "PASS"}</span> {id.slice(0, 8)}
                        {reason ? ` — ${reason}` : ""}
                        {basis ? ` (${basis})` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{JSON.stringify(item.parsed, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </details>
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

function ProviderCardView({ provider }: { provider: ProviderCard }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const button = `TEST ${providerLabels[provider.id as ProviderId].toUpperCase()}`;

  async function testProvider() {
    setBusy(true);
    setFailed(false);
    setResult(null);
    try {
      const response = await fetch("/api/ai/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      const body = (await response.json()) as { message?: string };
      setResult(body.message || "The check did not finish.");
      setFailed(!response.ok);
      router.refresh();
    } catch {
      setFailed(true);
      setResult("The check did not finish. No other provider was called.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="border border-rule px-3 py-3">
      <h3 className="font-mono text-[11px] tracking-[0.14em] uppercase">{provider.label}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Credential</dt>
          <dd>{provider.credential ? "Available" : "Not available"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Model</dt>
          <dd className="break-all">{provider.model}</dd>
          <dd className="mt-1 text-xs leading-relaxed text-ink-soft">{provider.modelNote}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Requests today</dt>
          <dd>{provider.requestsToday}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Desk daily allowance</dt>
          <dd>{provider.dailyAllowance}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Provider-returned limits</dt>
          <dd className="break-words">{provider.providerLimits ?? "None returned"}</dd>
          <dd className="mt-1 text-xs leading-relaxed text-ink-soft">These are the rate-limit headers from the latest attempt that sent them. They are not the desk allowance. A header name does not assign a daily period.</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Latest token account</dt>
          <dd className="break-words">{provider.tokenAccount ?? "Not reported"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Successful requests</dt>
          <dd>{provider.successfulRequests}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Failed requests</dt>
          <dd>{provider.failedRequests}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Latest result</dt>
          <dd className={`break-words ${provider.latestKind === "failure" ? "text-stamp" : ""}`}>{provider.latestResult ?? "No test yet"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Status</dt>
          <dd>{provider.status}</dd>
        </div>
        {provider.earlierFailure ? (
          <div>
            <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">Earlier failure</dt>
            <dd className="break-words text-xs leading-relaxed text-ink-soft">{provider.earlierFailure}</dd>
            <dd className="mt-1 text-xs leading-relaxed text-ink-soft">This is history. It is not the latest test.</dd>
          </div>
        ) : null}
      </dl>
      {provider.note ? <p className="mt-3 text-xs leading-relaxed text-ink-soft">{provider.note}</p> : null}
      <button
        type="button"
        onClick={testProvider}
        disabled={busy}
        className="mt-4 inline-flex h-10 items-center border border-ink px-3 text-sm disabled:opacity-50"
      >
        {busy ? "Testing…" : button}
      </button>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">This check calls only {provider.label} and uses one of today’s requests. It asks for a tiny JSON object. It does not run when this page opens.</p>
      {result ? <p className={`mt-2 text-sm ${failed ? "text-stamp" : ""}`}>{result}</p> : null}
    </article>
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
