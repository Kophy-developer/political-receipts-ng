import { Suspense } from "react";
import type { Metadata } from "next";
import { IntelligenceDesk } from "@/components/intelligence/desk";

export const metadata: Metadata = {
  title: "Live Intelligence",
};

export default function IntelligencePage() {
  return (
    <Suspense fallback={null}>
      <IntelligenceDesk />
    </Suspense>
  );
}
