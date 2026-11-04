import type { SourceCategory } from "@/lib/research/types";

export function tierForHost(domain: string, categories: SourceCategory[]) {
  const host = domain.replace(/^www\./, "").toLowerCase();
  const ranked = [...categories].sort((left, right) => left.rank - right.rank);
  for (const category of ranked) {
    if (category.domains.some((item) => host === item || host.endsWith(`.${item}`))) return category;
  }
  return ranked.find((category) => category.rank === 4) ?? { rank: 4, name: "Context", notes: "", domains: [] as string[] };
}
