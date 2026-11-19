/** The create-post body. The text is copied through and not rewritten. */
export function postCreateBody(text: string, mediaIds?: string[], replyToTweetId?: string | null) {
  const body: {
    text: string;
    media?: { media_ids: string[] };
    reply?: { in_reply_to_tweet_id: string };
  } = { text };
  if (mediaIds && mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }
  if (typeof replyToTweetId === "string" && /^\d{1,25}$/.test(replyToTweetId)) {
    body.reply = { in_reply_to_tweet_id: replyToTweetId };
  }
  return body;
}
