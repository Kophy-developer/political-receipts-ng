/** Counts from the desk's saved posts, reviewed 8 November 2026. These are not historical X rankings. */

export const queryAudit = {
  reviewedOn: "2026-11-08",
  distinctPosts: 80,
  scanRows: 11,
  groupsStored: 22,
  groupsWithPosts: 8,
  groupsWithoutPosts: 14,
  repliesAtLeast20: 0,
  repliesAtLeast5: 2,
  maxReplies: 6,
  maxLikes: 62,
  googleTrends: "Public Google Trends for Nigeria returned HTTP 429 on 8 November 2026. No trend rank was recorded.",
  fullArchive: "X full-archive search was not called. Access and cost have not been confirmed.",
  news: "One public BBC Africa page was retrieved on 8 November 2026. It included the headline “Will Atiku Abubakar be on Nigeria's presidential ballot after court ruling?” That is a news observation, not an X engagement count. None of the 80 stored posts described that court ruling.",
  sampleLimit: "These 80 posts are the pages recent search returned to the desk. They are not a history of what X discusses.",
} as const;

export type GroupSample = {
  slug: string;
  posts: number;
  postedFrom: string;
  postedTo: string;
  noisePosts: number;
  notPoliticalPosts: number;
  actionablePosts: number;
  discussionPosts: number;
  maxReplies: number;
  maxLikes: number;
  offTopicPosts: number;
  phrases: Array<{ phrase: string; posts: number }>;
  duplicates: string[];
  irrelevant: string[];
  limitations: string[];
};

export const sampledGroups: Record<string, GroupSample> = {
  inec: {
    slug: "inec",
    posts: 10,
    postedFrom: "2026-11-04T08:28:30Z",
    postedTo: "2026-11-04T12:12:08Z",
    noisePosts: 1,
    notPoliticalPosts: 1,
    actionablePosts: 3,
    discussionPosts: 6,
    maxReplies: 1,
    maxLikes: 62,
    offTopicPosts: 0,
    phrases: [
      { phrase: "INEC", posts: 5 },
      { phrase: "2027", posts: 5 },
      { phrase: "rig", posts: 5 },
      { phrase: "polling", posts: 3 },
      { phrase: "PVC", posts: 0 },
    ],
    duplicates: ["The same “occupy every INEC office” announcement is stored 3 times. Its highest like count was 62 and its highest reply count was 1."],
    irrelevant: [],
    limitations: ["PVC is in the stored query and in 0 of these 10 posts.", "The like count is not evidence that the announcement is true."],
  },
  "election-2027": {
    slug: "election-2027",
    posts: 10,
    postedFrom: "2026-11-04T08:11:45Z",
    postedTo: "2026-11-04T08:35:02Z",
    noisePosts: 3,
    notPoliticalPosts: 0,
    actionablePosts: 1,
    discussionPosts: 6,
    maxReplies: 1,
    maxLikes: 2,
    offTopicPosts: 0,
    phrases: [
      { phrase: "2027", posts: 10 },
      { phrase: "Nigeria", posts: 9 },
      { phrase: "election", posts: 5 },
      { phrase: "elections", posts: 5 },
      { phrase: "INEC", posts: 3 },
      { phrase: "Tinubu", posts: 3 },
      { phrase: "Obi", posts: 3 },
      { phrase: "Utomi", posts: 2 },
    ],
    duplicates: [],
    irrelevant: [],
    limitations: ["The page covers about 24 minutes on 4 November 2026. Nine posts had 0 replies."],
  },
  "candidates-parties": {
    slug: "candidates-parties",
    posts: 10,
    postedFrom: "2026-11-05T08:14:06Z",
    postedTo: "2026-11-05T08:15:04Z",
    noisePosts: 0,
    notPoliticalPosts: 0,
    actionablePosts: 0,
    discussionPosts: 10,
    maxReplies: 0,
    maxLikes: 1,
    offTopicPosts: 0,
    phrases: [
      { phrase: "Nigeria", posts: 7 },
      { phrase: "Tinubu", posts: 6 },
      { phrase: "APC", posts: 4 },
      { phrase: "Obi", posts: 1 },
      { phrase: "Atiku", posts: 1 },
      { phrase: "PDP", posts: 0 },
    ],
    duplicates: [],
    irrelevant: [],
    limitations: ["All 10 posts had 0 replies. The page covers about one minute. PDP is in the stored query and in 0 of these posts."],
  },
  presidency: {
    slug: "presidency",
    posts: 10,
    postedFrom: "2026-11-06T12:40:22Z",
    postedTo: "2026-11-06T18:21:38Z",
    noisePosts: 2,
    notPoliticalPosts: 2,
    actionablePosts: 0,
    discussionPosts: 8,
    maxReplies: 3,
    maxLikes: 11,
    offTopicPosts: 0,
    phrases: [
      { phrase: "Atiku", posts: 4 },
      { phrase: "Obi", posts: 2 },
      { phrase: "Wike", posts: 2 },
      { phrase: "Federal Government", posts: 1 },
      { phrase: "Abia", posts: 2 },
    ],
    duplicates: [],
    irrelevant: ["2 posts were Abia State government notices. They were marked not political."],
    limitations: ["The highest reply count was 3. A court story about Atiku's ballot, seen the same day on a BBC Africa page, is not in these posts."],
  },
  "national-assembly": {
    slug: "national-assembly",
    posts: 10,
    postedFrom: "2026-11-08T12:57:34Z",
    postedTo: "2026-11-08T13:34:38Z",
    noisePosts: 6,
    notPoliticalPosts: 6,
    actionablePosts: 0,
    discussionPosts: 4,
    maxReplies: 0,
    maxLikes: 6,
    offTopicPosts: 7,
    phrases: [
      { phrase: "Nigeria", posts: 0 },
      { phrase: "House of Representatives", posts: 4 },
    ],
    duplicates: [],
    irrelevant: ["7 posts matched a US Congress, Venezuela, or other non-Nigeria legislature pattern. 0 of 10 contained the word Nigeria."],
    limitations: ["The stored OR clause House of Representatives matches legislatures outside Nigeria. The tightened query below has not been sent, so its result count is 0."],
  },
  "finance-cbn": {
    slug: "finance-cbn",
    posts: 10,
    postedFrom: "2026-11-08T11:07:03Z",
    postedTo: "2026-11-08T11:53:35Z",
    noisePosts: 0,
    notPoliticalPosts: 0,
    actionablePosts: 0,
    discussionPosts: 10,
    maxReplies: 1,
    maxLikes: 1,
    offTopicPosts: 0,
    phrases: [
      { phrase: "naira", posts: 9 },
      { phrase: "inflation", posts: 8 },
      { phrase: "CBN", posts: 1 },
      { phrase: "dollar", posts: 2 },
      { phrase: "NELFUND", posts: 2 },
      { phrase: "devaluation", posts: 2 },
    ],
    duplicates: ["The same NELFUND and school-fees text is stored twice."],
    irrelevant: [],
    limitations: ["The group is named for the CBN, and CBN appeared in 1 of 10 posts. The recurring words were naira and inflation. Nine posts had 0 replies."],
  },
  "finance-debt": {
    slug: "finance-debt",
    posts: 10,
    postedFrom: "2026-11-08T11:26:30Z",
    postedTo: "2026-11-08T11:56:36Z",
    noisePosts: 0,
    notPoliticalPosts: 0,
    actionablePosts: 0,
    discussionPosts: 10,
    maxReplies: 1,
    maxLikes: 1,
    offTopicPosts: 3,
    phrases: [
      { phrase: "DMO", posts: 5 },
      { phrase: "public debt", posts: 4 },
      { phrase: "external debt", posts: 4 },
      { phrase: "Nigeria", posts: 5 },
      { phrase: "budget", posts: 3 },
      { phrase: "$54.5 billion", posts: 3 },
    ],
    duplicates: ["The same “budget problem” text is stored twice."],
    irrelevant: ["3 posts were about a French programme, a UK budget, or a US military retirement fund. The word budget in the stored query was enough to match them."],
    limitations: ["The tightened query has not been sent. Its result count is 0. The highest reply count in the stored page was 1."],
  },
  "united-match": {
    slug: "united-match",
    posts: 10,
    postedFrom: "2026-11-08T11:51:30Z",
    postedTo: "2026-11-08T11:57:33Z",
    noisePosts: 0,
    notPoliticalPosts: 0,
    actionablePosts: 0,
    discussionPosts: 10,
    maxReplies: 6,
    maxLikes: 14,
    offTopicPosts: 1,
    phrases: [
      { phrase: "Manchester United", posts: 9 },
      { phrase: "Premier League", posts: 5 },
      { phrase: "Aston Villa", posts: 2 },
      { phrase: "Glazers or Ineos", posts: 1 },
      { phrase: "goal", posts: 1 },
      { phrase: "match", posts: 2 },
    ],
    duplicates: [],
    irrelevant: ["1 post is an eFootball mobile score, not a match report."],
    limitations: ["This is the only United group with stored posts. Two posts had 6 replies, which is the highest reply count in all 80 stored posts and still below 20. Aston Villa appears twice in this six-minute window and is not a standing search group."],
  },
};

/** A narrower query is sent only where the stored page matched the wrong subject. It has not been sampled. */
export const tightenedQueries: Record<string, { query: string; because: string }> = {
  "national-assembly": {
    query: '("National Assembly" OR "Nigerian Senate") (Nigeria OR Nigerian) (bill OR appropriation) -is:retweet',
    because: "0 of 10 stored posts contained Nigeria. House of Representatives matched other legislatures. This narrower query has not been sent.",
  },
  "finance-debt": {
    query: '(DMO OR "public debt" OR "debt service") (Nigeria OR Nigerian) -is:retweet',
    because: "DMO appeared in 5 of 10 posts and public debt in 4. The bare word budget matched 3 foreign budgets. This narrower query has not been sent.",
  },
};
