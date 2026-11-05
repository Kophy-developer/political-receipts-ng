import type { ConversationDraft } from "@/lib/editorial/assess";

/** Local shapes of the ten stored conversations. The desk regresses on these without calling X or a model. */
export const storedScanId = "6dc2ba15-f367-4e35-a715-f18f5f507157";

export const storedScanFixture: ConversationDraft[] = [
  {
    id: "taxi-university",
    text: "Tinubu is said to have driven a taxi to pay his way through university. The line is being repeated as biography.",
  },
  {
    id: "obi-praise",
    text: "Peter Obi is the best president Nigeria never had. Nobody else comes close. He is simply the greatest.",
  },
  {
    id: "hardship",
    text: "People are skipping meals because food prices keep rising under this government. The daily argument is the cost of eating, not a slogan about who to hate.",
  },
  {
    id: "turnaround",
    text: "Tinubu will turn Nigeria around before the next election. I am marking this post so we can look back.",
  },
  {
    id: "ringtone-billboards",
    text: "A post says the government paid for a campaign ringtone and for billboards in every state capital. Both are stated as spending that already happened.",
  },
  {
    id: "sultan-visit",
    text: "Atiku visited the Sultan with ADC leaders. The visit is being read as a coalition signal.",
  },
  {
    id: "insult",
    text: "Foolish criminal idiot. Useless man. Nothing else.",
  },
  {
    id: "investment",
    text: "The presidency says Nigeria attracted $10 billion in foreign investment this quarter. That figure is being used as proof the economy has turned, which is a different claim from the number itself.",
  },
  {
    id: "crowd-votes",
    text: "The rally crowd was huge, so that party will obviously sweep the votes. You could see the result in the attendance.",
  },
  {
    id: "tsunami-2027",
    text: "2027 will be a tsunami. Tinubu cannot survive that wave. The election is already decided in the streets.",
  },
];
