import { inferClaimTypes, inferStatementKind, questionsFor } from "../lib/research/claim-types";
import { assertPublicUrl, blockedIp } from "../lib/research/ssrf";
import { proposeVerdict } from "../lib/research/verdict";
import { editorialFormat } from "../lib/intel/formats";

const failures: string[] = [];

function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

check("loopback blocked", blockedIp("127.0.0.1"));
check("private ten blocked", blockedIp("10.1.1.1"));
check("rfc1918 blocked", blockedIp("192.168.0.8"));
check("link local blocked", blockedIp("169.254.169.254"));
check("shared address blocked", blockedIp("100.64.1.1"));
check("public v4 allowed", blockedIp("8.8.8.8") === false);
check("loopback v6 blocked", blockedIp("::1"));
check("public v6 allowed", blockedIp("2001:4860:4860::8888") === false);

const sentence = "The National Bureau of Statistics publishes Nigeria's official Consumer Price Index.";
const types = inferClaimTypes(sentence, "politics");
check("cpi is an economic statistic", types.includes("economic statistic"));
check("bureau is a public-office record", types.includes("public-office record"));
check("cpi sentence is a fact", inferStatementKind("politics", sentence) === "fact");
const questions = questionsFor(types, "politics");
check("questions stay short", questions.length > 0 && questions.length <= 4);
check("attribution is asked", questions.some((item) => /publish/i.test(item.question)));

const empty = proposeVerdict({ statementKind: "fact", evidence: [] });
check("empty pack is insufficient", empty.factual === "INSUFFICIENT EVIDENCE" && empty.notTrue === false);

const opinion = proposeVerdict({
  statementKind: "opinion",
  evidence: [{ stance: "contradicts", review: "accepted", tierRank: 1, social: false }],
});
check("opinion is not #NotTrue", opinion.factual === "UNVERIFIED" && opinion.notTrue === false);

const format = editorialFormat({
  status: "Contradicted",
  confidence: "High",
  hashtag: null,
  statementKind: "opinion",
  evidence: [{ stance: "contradicts", review: "accepted" }],
});
check("format blocks #NotTrue on an opinion", format.notTrueAvailable === false && format.current !== "#NotTrue");

async function main() {
  const local = await assertPublicUrl("http://127.0.0.1/secret");
  const metadata = await assertPublicUrl("http://169.254.169.254/latest/meta-data/");
  const named = await assertPublicUrl("http://metadata.google.internal/");
  const userinfo = await assertPublicUrl("https://user:pass@example.com/report");
  check("ip loopback refused", local.ok === false);
  check("metadata ip refused", metadata.ok === false);
  check("metadata name refused", named.ok === false);
  check("url credentials refused", userinfo.ok === false);

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("evidence checks passed");
}

void main();
