import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StoryWorkspace } from "@/components/desk/workspace";
import { EmptyDesk } from "@/components/marks";
import { PageFrame } from "@/components/shell/page-frame";
import { getClaim } from "@/lib/db/claims";
import { storyReadingForClaim } from "@/lib/db/editorial";
import { loadFinalPost } from "@/lib/db/final-post";
import { loadClaimDrafts } from "@/lib/db/drafting";
import { loadStoredCapability } from "@/lib/db/connections";
import { publishedByClaim } from "@/lib/db/publishing";
import Loading from "@/app/loading";

export const metadata: Metadata = { title: "Story" };

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <StoryBody params={params} />
    </Suspense>
  );
}

async function StoryBody({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const result = await getClaim(id);
  if (!result.ok) {
    return (
      <PageFrame>
        <EmptyDesk title="Story unavailable" body="The desk could not read this story. Nothing was published." />
      </PageFrame>
    );
  }
  if (!result.claim) notFound();
  const [finalPost, drafts, capability, published, research] = await Promise.all([
    loadFinalPost(result.claim.id),
    loadClaimDrafts(result.claim.id),
    loadStoredCapability(),
    publishedByClaim(),
    storyReadingForClaim(result.claim.id),
  ]);
  const suggestions = drafts
    .filter((draft) => draft.style !== "manual")
    .map((draft) => ({ id: draft.id, label: draft.label, text: draft.text }));
  return (
    <StoryWorkspace
      claim={{
        id: result.claim.id,
        title: result.claim.claim,
        postText: result.claim.postText,
        postUrl: result.claim.postUrl,
        verdict: result.claim.proposedVerdict,
        confidence: result.claim.verdictConfidence,
        angle: result.claim.editorReview?.angles.find((item) => item.id === result.claim?.editorAngle)?.title
          || result.claim.editorAngleText
          || result.claim.editorAngle,
        verdictRecorded: Boolean(result.claim.verdictRecordedAt),
        angleChosen: Boolean(result.claim.editorAngle),
        evidence: result.claim.evidence.map((item) => ({ review: item.review, tier: item.tier, title: item.title, organization: item.organization })),
        recorded: result.claim.verdictEvidenceUsed.map((item) => ({ kind: item.kind, label: item.label })),
        interpretation: result.claim.attribution,
        limitation: result.claim.verdictUnknown,
      }}
      finalPostId={finalPost?.id ?? null}
      finalText={finalPost?.text ?? ""}
      sources={(finalPost?.sources ?? []).join("\n")}
      suggestions={suggestions}
      capability={capability}
      publication={published.get(result.claim.id) ?? null}
      research={research}
    />
  );
}
