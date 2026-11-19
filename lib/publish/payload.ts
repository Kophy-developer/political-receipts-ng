/** The create-post body. The text is copied through and not rewritten. */
export function postCreateBody(text: string, mediaIds?: string[]) {
  if (mediaIds && mediaIds.length > 0) {
    return {
      text,
      media: { media_ids: mediaIds },
    };
  }
  return { text };
}
