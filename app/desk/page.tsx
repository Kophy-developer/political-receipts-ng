import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyDesk } from "@/components/marks";
import { PageFrame } from "@/components/shell/page-frame";
import { listClaims } from "@/lib/db/claims";
import { loadFinalPost } from "@/lib/db/final-post";
import { nextAction, storyStage } from "@/lib/desk/story";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Desk" };

export default function DeskPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DeskQueue />
    </Suspense>
  );
}

async function DeskQueue() {
  await connection();
  const result = await listClaims();
  if (!result.ok) {
    return (
      <PageFrame>
        <EmptyDesk title="Desk unavailable" body="The stories could not be read. Nothing was published." />
      </PageFrame>
    );
  }
  const cards = await Promise.all(result.claims.map(async (claim) => {
    const finalPost = await loadFinalPost(claim.id);
    const facts = {
      hasConversation: Boolean(claim.postText && claim.postText !== "The original post text has not been filed."),
      acceptedEvidence: claim.evidence.filter((item) => item.review === "accepted").length
        || claim.verdictEvidenceUsed.filter((item) => item.kind !== "original allegation").length,
      verdictRecorded: Boolean(claim.verdictRecordedAt),
      angleChosen: Boolean(claim.editorAngle),
      finalText: finalPost?.text ?? "",
    };
    return { claim, action: nextAction(facts), stage: storyStage(facts) };
  }));
  return (
    <PageFrame className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.16em] text-ink-soft uppercase">Desk</p>
      <h1 className="mt-2 font-serif text-4xl tracking-[-0.03em]">What needs a post</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">One story at a time. Research, the decision, the writing, and the publish gate stay on that story.</p>
      {cards.length === 0 ? (
        <p className="mt-10 text-sm text-ink-soft">No story is filed yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {cards.map(({ claim, action }) => (
            <li key={claim.id} className="border border-rule px-5 py-5">
              <p className="font-serif text-2xl leading-snug tracking-[-0.02em]">{claim.claim}</p>
              <p className="mt-2 text-sm text-ink-soft">{claim.proposedVerdict ?? claim.status}{claim.verdictConfidence ? ` · ${claim.verdictConfidence}` : ""}</p>
              <Link href={`/desk/${claim.id}`} className="mt-5 inline-flex h-11 items-center bg-ink px-4 text-sm text-paper">
                {action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
