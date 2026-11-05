export const editorialTags = ["#CheckAm", "#ShowYourWorking", "#NotTrue"] as const;

export type EditorialTag = (typeof editorialTags)[number];

const canonical: Record<string, EditorialTag> = {
  checkam: "#CheckAm",
  showyourworking: "#ShowYourWorking",
  nottrue: "#NotTrue",
};

/** The last signature tag in the published text. Ordinary hashtags are ignored. */
export function editorialTagIn(text: string): EditorialTag | null {
  let found: EditorialTag | null = null;
  for (const match of text.matchAll(/#([A-Za-z]+)/g)) {
    const tag = canonical[match[1]!.toLowerCase()];
    if (tag) found = tag;
  }
  return found;
}

export function matchesEditorialTag(text: string, tag: EditorialTag) {
  for (const match of text.matchAll(/#([A-Za-z]+)/g)) {
    if (canonical[match[1]!.toLowerCase()] === tag) return true;
  }
  return false;
}

export function visiblePublished<T extends { text: string }>(posts: T[], filter: "All" | EditorialTag) {
  if (filter === "All") return posts;
  return posts.filter((post) => matchesEditorialTag(post.text, filter));
}
