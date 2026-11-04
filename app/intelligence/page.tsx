import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { IntelligenceDesk } from "@/components/intelligence/desk";
import { deskMode } from "@/lib/desk/mode";
import { listConversations } from "@/lib/db/conversations";
import { listResearchQueue } from "@/lib/db/intel";

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
  const [result, queue] = await Promise.all([listConversations(), listResearchQueue()]);
  const conversations = result.ok ? result.conversations : [];
  return (
    <IntelligenceDesk
      conversations={conversations}
      queue={queue.cards}
      queueInstalled={queue.installed}
      mode={deskMode(result.ok, result.ok ? undefined : result.reason, conversations.map((item) => item.origin))}
    />
  );
}
