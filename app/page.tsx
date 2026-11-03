import type { Metadata } from "next";
import { connection } from "next/server";
import { Briefing } from "@/components/overview/briefing";
import { loadSnapshot } from "@/lib/db/overview";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage() {
  await connection();
  const snapshot = await loadSnapshot();
  return <Briefing snapshot={snapshot} />;
}
