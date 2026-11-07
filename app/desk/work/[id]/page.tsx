import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/shell/page-frame";
import { ContinueResearch } from "@/components/desk/continue-research";
import { SeriesChart } from "@/components/desk/series-chart";
import { continuationOffer, loadDocumentPassages } from "@/lib/db/develop";
import { loadSearchResults } from "@/lib/db/search-results";
import { loadStory } from "@/lib/db/editorial";
import { describeSource } from "@/lib/editorial/quality";
import { documentLedger } from "@/lib/research/examine";
import { investigate } from "@/lib/research/investigate";
import { reviveAnalysis } from "@/lib/research/series";
import { readProvenance } from "@/lib/research/structured-cache";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Story" };

export default function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <WorkBody params={params} />
    </Suspense>
  );
}

async function WorkBody({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const story = await loadStory(id);
  if (!story) notFound();
  const quality = describeSource(story.card.sourceText || "");
  const plan = investigate(story.card.sourceText || "", quality);
  const analysis = reviveAnalysis((story.development as { analysis?: unknown } | null)?.analysis);
  const stage = (story.development as { researchStage?: unknown } | null)?.researchStage;
  const inventory = story.card.claimId ? await loadSearchResults(story.card.claimId) : null;
  const passages = story.card.claimId ? await loadDocumentPassages(story.card.claimId) : new Map<string, string>();
  const offer = await continuationOffer(id);
  const latestAttempt = offer.ok ? offer.why : story.card.storyReason;
  const provenance = readProvenance((story.development as { seriesProvenance?: unknown } | null)?.seriesProvenance);
  const nextAction = offer.ok && offer.available
    ? (offer.savedData ? "Resume with validated saved data. The live API is not called." : offer.structuredId ? "Read the official series. No search and no PDF download run until you confirm." : offer.searches === 0 ? "Open saved documents. No new search runs until you confirm." : "Continue research on this story. Nothing runs until you confirm.")
    : (offer.ok ? [offer.blocker, offer.why].filter(Boolean).join(". ") : story.card.storyAction);
  const ledger = documentLedger((inventory?.results ?? []).map((item) => ({
    id: item.id,
    url: item.url,
    title: item.title,
    domain: item.domain,
    snippet: item.snippet,
    retrievalStatus: item.retrievalStatus,
    inDomain: item.inDomain,
    rejection: item.rejectionReason,
    text: passages.get(item.url) ?? null,
  })), plan, 2);
  const found = inventory?.results.length ?? 0;
  const opened = inventory?.results.filter((item) => item.retrievalStatus === "retrieved").length ?? story.sources.filter((item) => item.opened).length;
  const showInventory = found > 0 || story.sources.length > 0;

  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Story</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">{story.card.title}</h1>
      <p className="mt-3 text-sm">{story.card.storyState}</p>
      <p className="mt-2 text-sm leading-relaxed">{latestAttempt}</p>
      <p className="mt-2 text-sm text-ink-soft">{nextAction}</p>
      <div className="mt-8 space-y-6">
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Source</h2>
          <p className="mt-2 text-sm leading-relaxed">{story.card.sourceText || "No source text is stored on this card."}</p>
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Interpretation</h2>
          <p className="mt-2 text-sm leading-relaxed">{story.card.reason || story.card.title}</p>
          {story.card.developmentAngle ? <p className="mt-2 text-sm leading-relaxed">Proposed angle: {story.card.developmentAngle}</p> : <p className="mt-2 text-sm text-ink-soft">No angle is proposed until development reads the evidence.</p>}
          {story.card.pillar ? <p className="mt-2 text-sm text-ink-soft">Pillar: {story.card.pillar}</p> : null}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">What we are investigating</h2>
          <p className="mt-2 text-sm leading-relaxed">{plan.attribution}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {plan.questions.map((item) => <li key={item.question}>{item.purpose.replaceAll("_", " ")}: {item.question}</li>)}
          </ul>
          {plan.definitions.length ? (
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">
              {plan.definitions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Research</h2>
          <p className="mt-2 text-sm">{typeof stage === "string" ? stage : story.card.storyState}. {latestAttempt}</p>
          {showInventory ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>{found || story.sources.length} stored results · {opened} opened.</p>
              <ul className="space-y-1">
                {(ledger.length > 0 ? ledger : story.sources.map((item) => ({ id: item.title, title: item.title, status: item.opened ? "opened" as const : "not opened" as const, reason: item.stance || "" }))).map((item) => (
                  <li key={item.id}>{item.status} · {item.title}{item.reason ? ` · ${item.reason}` : ""}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">{plan.numerical ? "No source has been opened yet. Search snippets are not statistics." : "No research list is shown because research has not stored a result."}</p>
          )}
          {provenance ? (
            <div className="mt-4 space-y-1 text-sm">
              <h3 className="font-serif text-xl">Official series</h3>
              <p>{provenance.live ? "Live source." : "Cached official data. Not a live retrieval."}</p>
              <p>{provenance.label}</p>
              <p>Indicator {provenance.indicator} · {provenance.country} · {provenance.unit}</p>
              <p>Source update: {provenance.sourceUpdated || "not stated"}</p>
              <p>Years available: {provenance.years.length ? `${provenance.years[0]}–${provenance.years[provenance.years.length - 1]}` : "none"}</p>
              {provenance.pageUrl ? <p>{provenance.pageUrl}</p> : null}
            </div>
          ) : null}
          {analysis ? (
            <div className="mt-4 space-y-2 text-sm">
              <h3 className="font-serif text-xl">What the evidence shows</h3>
              {analysis.interpretations.map((item) => <p key={item}>{item}</p>)}
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <caption className="pb-2 text-left">{analysis.series} · {analysis.unit} · {analysis.sourceName}{analysis.url ? ` · ${analysis.url}` : ""}</caption>
                <thead>
                  <tr className="border-b border-rule">
                    <th className="py-1 font-normal">Year</th>
                    <th className="py-1 font-normal">Value</th>
                    <th className="py-1 font-normal">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.observations.map((item) => (
                    <tr key={`${item.series}-${item.year}`} className="border-b border-rule">
                      <td className="py-1">{item.year}</td>
                      <td className="py-1">{item.value}</td>
                      <td className="py-1">{item.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="pt-2 font-serif text-xl">What remains uncertain</h3>
              {analysis.limitations.map((item) => <p key={item}>{item}</p>)}
              {analysis.chart ? <SeriesChart chart={analysis.chart} /> : <p>No chart is drawn because the opened series cannot support one.</p>}
            </div>
          ) : null}
          <p className="mt-3 text-sm">{story.card.storyState === "Ready for You" ? "Ready for You: a draft is waiting. Nothing has been published." : `Ready for You: not yet. Current status is ${story.card.storyState}.`}</p>
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Next action</h2>
          <p className="mt-2 text-sm">{story.card.storyState}. {nextAction}</p>
          {offer.ok && offer.available ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>Question: {offer.question}</p>
              <p>Why the saved results are not enough: {offer.why}</p>
              <p>Expected requests: {offer.searches} searches and {offer.documents} documents.</p>
              <p>Remaining today: {offer.searchesRemaining} searches and {offer.documentsRemaining} documents. The daily cap is not reset.</p>
              <ContinueResearch id={id} action={offer.savedData ? "resume-saved" : offer.structuredId ? "read-structured" : offer.searches === 0 ? "open-saved" : "continue"} label={offer.savedData ? "Resume with validated saved data" : offer.structuredId ? "Read the official series" : offer.searches === 0 ? "Open saved documents" : "Continue research"} />
            </div>
          ) : (
            <p className="mt-3 text-sm">{offer.ok ? (offer.blocker ? `${offer.blocker}. ${offer.why}` : offer.why) : offer.message}</p>
          )}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Draft</h2>
          {story.drafts.length === 0 && story.card.developmentDrafts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No draft is stored.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {story.drafts.map((draft) => (
                <li key={draft.id} className="text-sm">
                  <p className="font-mono text-[11px] uppercase">{draft.version || "draft"} · {draft.status}</p>
                  <p className="mt-1 leading-relaxed">{draft.content}</p>
                </li>
              ))}
              {story.drafts.length === 0 ? story.card.developmentDrafts.map((text) => (
                <li key={text} className="text-sm leading-relaxed">{text}</li>
              )) : null}
            </ul>
          )}
        </section>
        <section className="border border-rule px-4 py-4">
          <h2 className="font-serif text-2xl">Approval</h2>
          <p className="mt-2 text-sm">Publishing still requires the exact text and the checklist. This page does not send a post.</p>
          {story.card.claimId ? (
            <Link href={`/desk/${story.card.claimId}`} className="mt-3 inline-flex h-11 items-center bg-ink px-3 text-sm text-paper">Open the publish gate for this story</Link>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">This card has no claim yet, so the publish gate is not available.</p>
          )}
          <p className="mt-3 text-sm"><Link href="/desk" className="underline">Back to the desk</Link></p>
        </section>
      </div>
    </PageFrame>
  );
}
