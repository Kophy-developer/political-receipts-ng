import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsPanel } from "@/components/settings/panel";
import { systemHealth } from "@/lib/db/health";
import { usageView } from "@/lib/db/usage";
import { credentialFlags } from "@/lib/x/env";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <SettingsPanel flags={credentialFlags()} health={await systemHealth()} usage={await usageView()} />
    </Suspense>
  );
}
