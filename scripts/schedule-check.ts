import { readFileSync } from "node:fs";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/settings/schedule-desk.tsx", import.meta.url), "utf8");
const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

check("README documents cron-job.org as primary cadence", /cron-job\.org/i.test(readme) && /every 3 hours/i.test(readme));
check("schedule desk mentions cron-job.org and the run path", /cron-job\.org/i.test(desk) && desk.includes("/api/schedule/run") && desk.includes("CRON_SECRET"));
check("vercel.json stays daily Hobby-safe backup", /"schedule"\s*:\s*"0 0 \* \* \*"/.test(vercel) && /\/api\/schedule\/run/.test(vercel));
check("README marks Vercel cron as backup", /backup/i.test(readme) && /0 0 \* \* \*/.test(readme));
check("README and schedule desk document five-minute timeout", /330 seconds|300/i.test(readme) && /scheduleRunMaxDurationSeconds|five minutes|330/i.test(desk));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("schedule checks passed");
