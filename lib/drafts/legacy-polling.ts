/** The first published polling-unit story. These rules stay with that story. */
export function isPollingUnitStory(text: string) {
  return /\b453\b/.test(text) && /polling|inec|voter register|photograph/i.test(text);
}

export function legacyPollingLines() {
  return [
    "Do not reach for: I checked INEC sites. The record shows. BBC and Daily Trust talk about. The Electoral Act and reports. The claim lacks evidence. Use one of those only if the sentence truly needs it.",
    "The 453-polling-unit claim was not established. That is not proof that a batch of 453 units does not exist. Do not use a register total, including 176,846, to close that question. The fair thought is that you went looking for the figure and could not establish it.",
    "Keep the real reported controversy separate from the extra claim. Credible reporting describes suspected AI-generated photographs in the preliminary voter register, and INEC responded. The 453 figure is the part that was not established. Do not paste a template sentence.",
    "You must not say: 453 is false; INEC never created 453; the account lied; AI-generated voters voted; the final certified register contained the irregularities; #NotTrue; criminal organisation.",
  ];
}

const legacyForbidden = [
  [/\b453 is false\b/i, "The drafts may not call 453 false."],
  [/\bnever created 453\b/i, "The drafts may not say INEC never created 453 polling units."],
  [/\b(did not|didn't) create 453\b/i, "The drafts may not say INEC did not create 453 polling units."],
  [/\bdefinitely voted\b/i, "The drafts may not say AI-generated voters voted."],
  [/\bai-generated voters (have |had )?voted\b/i, "The drafts may not say AI-generated voters voted."],
  [/\bfinal certified register contained\b/i, "The drafts may not put the irregularities in the final certified register."],
  [/\bfinal register contained\b/i, "The drafts may not put the irregularities in the final register."],
  [/\bcriminal organisation\b/i, "The insult about INEC is outside this verdict."],
  [/\bno extra 453\b/i, "Do not treat a register total as proof that a 453-unit batch does not exist."],
  [/\b176,?846\b/i, "Do not cite 176,846 as if it disproves a 453-unit batch."],
  [/\b453\b[^.]{0,90}\b(do not|don't|doesn't|does not) exist\b/i, "The research did not establish 453. It did not prove that a 453-unit batch does not exist."],
  [/\b(do not|don't|doesn't|does not) exist\b[^.]{0,90}\b453\b/i, "The research did not establish 453. It did not prove that a 453-unit batch does not exist."],
] as const;

export function legacyWordingProblem(text: string) {
  for (const [pattern, reason] of legacyForbidden) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

export function legacyTopicProblem(style: string, text: string) {
  if (!/photograph|ai-generated|453|voter register|polling unit/i.test(text)) {
    return "The draft does not stay on the photographs or the 453 claim.";
  }
  if (style !== "punchy" && style !== "manual" && !/inec/i.test(text)) {
    return "This style still needs INEC's response in the wording.";
  }
  if ((style === "conversational" || style === "analytical" || style === "thread") && !/453/.test(text)) {
    return "This style still needs the 453 claim, as something the evidence did not establish.";
  }
  return null;
}
