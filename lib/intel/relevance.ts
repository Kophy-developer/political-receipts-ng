export type Relevance = "political" | "possibly_political" | "not_political";

export type TermRule = {
  term: string;
  anchored: boolean;
};

const places = [
  "nigeria",
  "nigerian",
  "naira",
  "lagos",
  "abuja",
  "kano",
  "ibadan",
  "enugu",
  "kaduna",
  "rivers state",
  "oyo state",
  "borno",
];

export function classifyPost(text: string, rules: TermRule[]) {
  const haystack = text.toLowerCase();
  const ordered = [...rules].filter((rule) => rule.term.trim().length > 1).sort((a, b) => b.term.length - a.term.length);
  const anchored = ordered.find((rule) => rule.anchored && haystack.includes(rule.term.toLowerCase()));
  if (anchored) {
    return {
      relevance: "political" as const,
      matchedTerm: anchored.term.toLowerCase(),
      reason: `Matched “${anchored.term}”, a configured Nigerian institution or office.`,
    };
  }
  const term = ordered.find((rule) => haystack.includes(rule.term.toLowerCase()));
  const hasPlace = places.some((place) => haystack.includes(place));
  if (term && hasPlace) {
    return {
      relevance: "political" as const,
      matchedTerm: term.term.toLowerCase(),
      reason: `Matched “${term.term}” together with a Nigerian place or the naira.`,
    };
  }
  if (term) {
    return {
      relevance: "possibly_political" as const,
      matchedTerm: term.term.toLowerCase(),
      reason: `Matched “${term.term}” without a Nigerian anchor, so the desk is not treating it as political yet.`,
    };
  }
  return {
    relevance: "not_political" as const,
    matchedTerm: "",
    reason: hasPlace
      ? "Mentions Nigeria or a Nigerian place without a configured political term."
      : "No configured political term.",
  };
}
