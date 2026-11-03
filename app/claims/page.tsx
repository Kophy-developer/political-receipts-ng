import type { Metadata } from "next";
import { connection } from "next/server";
import { ClaimsBoard } from "@/components/claims/board";
import { deskMode } from "@/lib/desk/mode";
import { listClaims } from "@/lib/db/claims";

export const metadata: Metadata = {
  title: "Claims",
};

export default async function ClaimsPage() {
  await connection();
  const result = await listClaims();
  const claims = result.ok ? result.claims : [];
  return <ClaimsBoard claims={claims} mode={deskMode(result.ok, result.ok ? undefined : result.reason, claims.map((claim) => claim.origin))} />;
}
