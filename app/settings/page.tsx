import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsPanel } from "@/components/settings/panel";
import { providerBoard } from "@/lib/db/ai-attempts";
import { systemHealth } from "@/lib/db/health";
import { usageView } from "@/lib/db/usage";
import { credentialFlags } from "@/lib/x/env";

export const metadata: Metadata = {
  title: "Settings",
};

async function SettingsBody() {
  const [health, usage, board] = await Promise.all([systemHealth(), usageView(), providerBoard()]);
  return <SettingsPanel flags={credentialFlags()} health={health} usage={usage} providers={board.providers} paidUsage={board.paidUsage} />;
}

export default async function SettingsPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <SettingsBody />
    </Suspense>
  );
}
