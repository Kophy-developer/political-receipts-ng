import { writeFileSync } from "node:fs";
import {
  POLLING_UNIT_CLAIM_ID,
  pollingUnitReview,
  proposalAttribution,
  proposalCaveat,
  proposalColumns,
  proposalUnknown,
  reviewColumnsLeaveThePostAlone,
} from "../lib/research/editor-review";

if (!reviewColumnsLeaveThePostAlone(proposalColumns)) {
  console.error("Refusing to write a proposal that would touch the original post or the recorded status.");
  process.exit(1);
}

const packet = JSON.stringify(pollingUnitReview);
if (packet.includes("$reviewpacket$")) {
  console.error("The review packet cannot be dollar-quoted safely.");
  process.exit(1);
}

const sql = `
update public.claims
set
  proposed_verdict = 'NEEDS CONTEXT',
  verdict_reasoning = $reviewreason$${pollingUnitReview.explanation}$reviewreason$,
  verdict_caveats = $reviewcaveat$${proposalCaveat}$reviewcaveat$,
  verdict_unknown = $reviewunknown$${proposalUnknown}$reviewunknown$,
  verdict_confidence = 'moderate',
  attribution_note = $reviewattr$${proposalAttribution}$reviewattr$,
  editor_review = $reviewpacket$${packet}$reviewpacket$::jsonb,
  format_recommendation = '#CheckAm'
where id = '${POLLING_UNIT_CLAIM_ID}'
  and verdict_recorded_at is null;
`;

const out = "/tmp/present-editor-review.sql";
writeFileSync(out, sql);
console.log(out);
