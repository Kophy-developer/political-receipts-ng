import type { Metadata } from "next";
import { connection } from "next/server";
import { OpportunitiesBoard } from "@/components/opportunities/board";
import { listOpportunityDesk } from "@/lib/db/opportunities";

export const metadata: Metadata = {
  title: "Opportunities",
};

export default async function OpportunitiesPage() {
  await connection();
  const desk = await listOpportunityDesk();
  return (
    <OpportunitiesBoard
      items={desk.ok ? desk.items : []}
      history={desk.ok ? desk.history : []}
      reviews={desk.ok ? desk.reviews : []}
      conversations={desk.ok ? desk.conversations : []}
      unavailable={!desk.ok}
    />
  );
}
