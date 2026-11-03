import type { Metadata } from "next";
import { Briefing } from "@/components/overview/briefing";

export const metadata: Metadata = {
  title: "Overview",
};

export default function OverviewPage() {
  return <Briefing />;
}
