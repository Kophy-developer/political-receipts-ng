import { Suspense } from "react";
import type { Metadata } from "next";
import { DraftStudio } from "@/components/drafts/studio";

export const metadata: Metadata = {
  title: "Drafts",
};

export default function DraftsPage() {
  return (
    <Suspense fallback={null}>
      <DraftStudio />
    </Suspense>
  );
}
