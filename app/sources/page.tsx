import type { Metadata } from "next";
import { Library } from "@/components/sources/library";

export const metadata: Metadata = {
  title: "Sources",
};

export default function SourcesPage() {
  return <Library />;
}
