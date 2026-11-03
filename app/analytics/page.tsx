import type { Metadata } from "next";
import { AnalyticsBoard } from "@/components/analytics/board";

export const metadata: Metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return <AnalyticsBoard />;
}
