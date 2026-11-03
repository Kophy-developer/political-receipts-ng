import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsPanel } from "@/components/settings/panel";
import { credentialFlags } from "@/lib/x/env";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <SettingsPanel flags={credentialFlags()} />
    </Suspense>
  );
}
