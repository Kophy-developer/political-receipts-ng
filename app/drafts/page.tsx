import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DraftStudio } from "@/components/drafts/studio";
import { deskMode } from "@/lib/desk/mode";
import { listDraftDesk } from "@/lib/db/drafts";

export const metadata: Metadata = {
  title: "Drafts",
};

export default function DraftsPage() {
  return (
    <Suspense fallback={null}>
      <DraftsBody />
    </Suspense>
  );
}

async function DraftsBody() {
  await connection();
  const result = await listDraftDesk();
  const claims = result.ok ? result.claims : [];
  const packages = result.ok ? result.packages : [];
  return (
    <DraftStudio
      claims={claims}
      packages={packages}
      mode={deskMode(result.ok, result.ok ? undefined : result.reason, claims.map((claim) => claim.origin))}
    />
  );
}
