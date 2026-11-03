import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { claimById, claims } from "@/lib/claims";
import { Dossier } from "@/components/claims/dossier";
import Loading from "@/app/loading";

export function generateStaticParams() {
  return claims.map((claim) => ({ id: claim.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const claim = claimById(id);
  return {
    title: claim ? claim.id.toUpperCase() : "Claim",
    description: claim?.claim,
  };
}

export default function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <ClaimBody params={params} />
    </Suspense>
  );
}

async function ClaimBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claim = claimById(id);
  if (!claim) notFound();
  return <Dossier claim={claim} />;
}
