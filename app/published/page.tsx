import type { Metadata } from "next";
import { Archive } from "@/components/published/archive";

export const metadata: Metadata = {
  title: "Published",
};

export default function PublishedPage() {
  return <Archive />;
}
