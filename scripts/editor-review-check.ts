import {
  acceptanceColumns,
  angleChosen,
  angleColumns,
  draftUnlocked,
  evidenceUsedFrom,
  ownAngleWritten,
  parseEditorReview,
  pollingUnitReview,
  proposalColumns,
  reviewColumnsLeaveThePostAlone,
} from "../lib/research/editor-review";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const packet = parseEditorReview(pollingUnitReview);
check("packet parses", packet !== null);
check("proposed verdict is NEEDS CONTEXT", packet?.proposedVerdict === "NEEDS CONTEXT");
check("format is #CheckAm", packet?.formatRecommendation === "#CheckAm");
check("packet does not recommend #NotTrue", !JSON.stringify(packet).includes("#NotTrue") || packet?.notTrueNote.includes("Not recommended") === true);
check("four separated findings", packet?.findings.length === 4);
check("supported finding is first", packet?.findings[0]?.label === "SUPPORTED BY AVAILABLE REPORTING");
check("453 claim is not established", packet?.findings[1]?.label === "NOT ESTABLISHED" && /453 polling units/.test(packet.findings[1].text));
check("connection is not established", packet?.findings[2]?.label === "NOT ESTABLISHED");
check("origin is unknown", packet?.findings[3]?.label === "UNKNOWN");
check("three starting angles", packet?.angles.length === 3);
check("sources are https", packet?.sources.every((source) => source.url.startsWith("https://")) === true);
check("primary records are present", packet?.sources.filter((source) => source.kind === "primary record").length === 2);
check("independent reporting is present", packet?.sources.filter((source) => source.kind === "independent reporting").length === 2);
check("original allegation is present", packet?.sources.some((source) => source.kind === "original allegation" && source.url.includes("2117896758088941615")) === true);
check("evidence list keeps every source", packet ? evidenceUsedFrom(packet).length === packet.sources.length : false);

check("preset angle needs no take", angleChosen("receipts", ""));
check("empty own angle is not chosen", angleChosen("own", "") === false);
check("short own angle is not chosen", ownAngleWritten("my angle") === false);
check("written own angle is chosen", angleChosen("own", "The number and the photographs should be told as two stories."));
check("missing angle is closed", angleChosen(null, null) === false);

const closed = draftUnlocked({ recordedAt: null, angle: "receipts", angleText: null });
check("acceptance is required", closed.open === false);
const noAngle = draftUnlocked({ recordedAt: "2026-11-04T18:00:00Z", angle: null, angleText: null });
check("angle is required", noAngle.open === false);
const open = draftUnlocked({ recordedAt: "2026-11-04T18:00:00Z", angle: "serious", angleText: null });
check("accepted verdict and angle open the gate", open.open === true);
check("open gate still writes no draft", open.reason.includes("does not write the post"));
const own = draftUnlocked({
  recordedAt: "2026-11-04T18:00:00Z",
  angle: "own",
  angleText: "The number and the photographs should be told as two stories.",
});
check("written own angle opens the gate", own.open === true);

check("proposal columns leave the post and the status alone", reviewColumnsLeaveThePostAlone(proposalColumns));
check("acceptance columns do not rewrite the post", acceptanceColumns.every((column) => !column.startsWith("original_")));
check("angle columns do not rewrite the post", reviewColumnsLeaveThePostAlone(angleColumns));
check("take is filed on its own", (angleColumns as readonly string[]).includes("editor_take"));
check("take is not working notes", (angleColumns as readonly string[]).includes("working_notes") === false);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("editor review checks passed");
