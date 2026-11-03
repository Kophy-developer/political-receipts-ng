import type { Metadata } from "next";
import { connection } from "next/server";
import { Library } from "@/components/sources/library";
import { deskMode } from "@/lib/desk/mode";
import { listSources } from "@/lib/db/sources";

export const metadata: Metadata = {
  title: "Sources",
};

export default async function SourcesPage() {
  await connection();
  const result = await listSources();
  const sources = result.ok ? result.sources : [];
  return <Library sources={sources} mode={deskMode(result.ok, result.ok ? undefined : result.reason, sources.map((source) => source.origin))} />;
}