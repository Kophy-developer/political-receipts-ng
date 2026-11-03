import type { Metadata } from "next";
import { ClaimsBoard } from "@/components/claims/board";

export const metadata: Metadata = {
  title: "Claims",
};

export default function ClaimsPage() {
  return <ClaimsBoard />;
}
