const secretLike = /bearer\s+|token|secret|oauth|api[_ -]?key|authorization|password/i;

export function scrubPublicMessage(input: string) {
  const text = input.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!text || secretLike.test(text)) return "X rejected the request.";
  return text;
}
