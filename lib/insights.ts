import type { PublishedPost } from "@/lib/types";

export interface GroupStat {
  label: string;
  count: number;
  impressions: number;
  engagements: number;
  bookmarks: number;
  reposts: number;
  engagementRate: number;
  bookmarkRate: number;
}

export function sumPosts(posts: PublishedPost[]) {
  return posts.reduce(
    (total, post) => {
      total.impressions += post.impressions;
      total.engagements += post.engagements;
      total.bookmarks += post.bookmarks;
      total.reposts += post.reposts;
      total.replies += post.replies;
      total.profileVisits += post.profileVisits;
      total.follows += post.follows;
      return total;
    },
    {
      impressions: 0,
      engagements: 0,
      bookmarks: 0,
      reposts: 0,
      replies: 0,
      profileVisits: 0,
      follows: 0,
    },
  );
}

export function groupPosts(
  posts: PublishedPost[],
  key: (post: PublishedPost) => string,
): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const post of posts) {
    const label = key(post);
    const current = map.get(label) ?? {
      label,
      count: 0,
      impressions: 0,
      engagements: 0,
      bookmarks: 0,
      reposts: 0,
      engagementRate: 0,
      bookmarkRate: 0,
    };
    current.count += 1;
    current.impressions += post.impressions;
    current.engagements += post.engagements;
    current.bookmarks += post.bookmarks;
    current.reposts += post.reposts;
    map.set(label, current);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      engagementRate: row.impressions ? row.engagements / row.impressions : 0,
      bookmarkRate: row.impressions ? row.bookmarks / row.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

export function hourWindow(hour: number) {
  if (hour < 10) return "Morning · before 10:00 WAT";
  if (hour < 16) return "Midday · 10:00–16:00 WAT";
  if (hour < 20) return "Evening · 16:00–20:00 WAT";
  return "Night · after 20:00 WAT";
}

export function demoInsights(posts: PublishedPost[]) {
  const hashtags = groupPosts(posts, (post) => post.hashtag);
  const topBookmark = [...hashtags].sort((a, b) => b.bookmarkRate - a.bookmarkRate)[0];
  const modes = groupPosts(posts, (post) => post.mode);
  const dataDriven = modes.find((row) => row.label === "Data-driven");
  const plain = modes.find((row) => row.label === "Plain commentary");
  const windows = groupPosts(posts, (post) => hourWindow(post.hour));
  const topWindow = [...windows].sort((a, b) => b.engagementRate - a.engagementRate)[0];
  const modeLine =
    dataDriven && plain && dataDriven.engagementRate >= plain.engagementRate
      ? "Data-driven posts outperform plain commentary."
      : "Plain commentary outperforms data-driven posts in this sample.";
  return {
    hashtags,
    modes,
    windows,
    lines: [
      topBookmark
        ? `${topBookmark.label} posts currently generate the highest bookmark rate.`
        : "No hashtag comparison is available.",
      modeLine,
      topWindow
        ? `In this sample, the ${topWindow.label} window has the highest engagement rate.`
        : "No timing comparison is available.",
    ],
  };
}
