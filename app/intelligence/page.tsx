import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { IntelligenceDesk } from "@/components/intelligence/desk";
import { deskMode } from "@/lib/desk/mode";
import { listConversations } from "@/lib/db/conversations";

export const metadata: Metadata = {
  title: "Live Intelligence",
};

export default function IntelligencePage() {
  return (
    <Suspense fallback={null}>
      <IntelligenceBody />
    </Suspense>
  );
}

async function IntelligenceBody() {
  await connection();
  const result = await listConversations();
  const conversations = result.ok ? result.conversations : [];
  return (
    <IntelligenceDesk
      conversations={conversations}
      mode={deskMode(result.ok, result.ok ? undefined : result.reason, conversations.map((item) => item.origin))}
    />
  );
}
