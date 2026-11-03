import type { Metadata } from "next";
import { connection } from "next/server";
import { Archive } from "@/components/published/archive";
import { deskMode } from "@/lib/desk/mode";
import { listPublished } from "@/lib/db/overview";

export const metadata: Metadata = {
  title: "Published",
};

export default async function PublishedPage() {
  await connection();
  const result = await listPublished();
  const posts = result.ok ? result.posts : [];
  return <Archive posts={posts} mode={deskMode(result.ok, result.ok ? undefined : result.reason, posts.map((post) => post.origin))} />;
}
