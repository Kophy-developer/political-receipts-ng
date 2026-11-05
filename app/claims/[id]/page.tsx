import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Dossier } from "@/components/claims/dossier";
import { EmptyDesk } from "@/components/marks";
import { PageFrame } from "@/components/shell/page-frame";
import { getClaim } from "@/lib/db/claims";
import { providerBoard } from "@/lib/db/ai-attempts";
import { loadEditorIdentity } from "@/lib/db/identity";
import { loadClaimDrafts } from "@/lib/db/drafting";
import { loadSearchResults } from "@/lib/db/search-results";
import { loadPlan } from "@/lib/research/plan";
import Loading from "@/app/loading";

export const metadata: Metadata = {
  title: "Claim",
};

export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ClaimBody params={params} />
    </Suspense>
  );
}

async function ClaimBody({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const result = await getClaim(id);
  if (!result.ok) {
    return (
      <PageFrame>
        <EmptyDesk
          title={result.reason === "unconfigured" ? "Database not configured" : "Claim unavailable"}
          body={result.reason === "schema" ? "The editorial tables are not installed yet." : "The desk could not read this claim from the database."}
        />
      </PageFrame>
    );
  }
  if (!result.claim) notFound();
  const plan = await loadPlan(result.claim.id);
  const inventory = await loadSearchResults(result.claim.id);
  const drafts = await loadClaimDrafts(result.claim.id);
  const [board, identity] = await Promise.all([providerBoard(), loadEditorIdentity()]);
  return (
    <Dossier
      claim={result.claim}
      mode={result.claim.origin === "demo" ? "demo" : "live"}
      plan={plan}
      inventory={{ results: inventory.results, note: inventory.note }}
      drafts={drafts}
      providers={board.providers}
      editorName={identity.name}
    />
  );
}
