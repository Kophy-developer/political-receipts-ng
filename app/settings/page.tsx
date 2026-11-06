import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SettingsPanel } from "@/components/settings/panel";
import { editorialAssessmentHistory, latestUnderstandingFailure, providerBoard } from "@/lib/db/ai-attempts";
import { savedUnderstandingRecoveryAvailable } from "@/lib/db/recover-understanding";
import { systemHealth } from "@/lib/db/health";
import { usageView } from "@/lib/db/usage";
import { loadEditorIdentity } from "@/lib/db/identity";
import { credentialFlags } from "@/lib/x/env";

export const metadata: Metadata = {
  title: "Settings",
};

async function SettingsBody() {
  const [health, usage, board, identity, editorialHistory, understandingFailure, canRecoverUnderstanding] = await Promise.all([
    systemHealth(),
    usageView(),
    providerBoard(),
    loadEditorIdentity(),
    editorialAssessmentHistory(),
    latestUnderstandingFailure(),
    savedUnderstandingRecoveryAvailable(),
  ]);
  return (
    <SettingsPanel
      flags={credentialFlags()}
      health={health}
      usage={usage}
      providers={board.providers}
      paidUsage={board.paidUsage}
      identity={identity}
      editorialHistory={editorialHistory}
      understandingFailure={understandingFailure}
      canRecoverUnderstanding={canRecoverUnderstanding}
    />
  );
}

export default async function SettingsPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <SettingsBody />
    </Suspense>
  );
}
