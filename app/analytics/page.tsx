import type { Metadata } from "next";
import { connection } from "next/server";
import { AnalyticsBoard } from "@/components/analytics/board";
import { performanceSummary } from "@/lib/db/metrics";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  await connection();
  const result = await performanceSummary();
  const mode = result.ok ? (result.readings > 0 ? "live" : "empty") : result.reason === "unconfigured" ? "unconfigured" : "unreachable";
  return <AnalyticsBoard mode={mode} readings={result.ok ? result.readings : 0} />;
}
