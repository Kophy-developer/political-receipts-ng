import { connection } from "next/server";
import { latestReprocessJob } from "@/lib/db/reprocess-jobs";

export async function GET(request: Request) {
  await connection();
  const scanId = new URL(request.url).searchParams.get("scanId");
  if (!scanId || !/^[0-9a-f-]{36}$/i.test(scanId)) {
    return Response.json({ job: null, xRequests: 0 }, { status: 400 });
  }
  const job = await latestReprocessJob(scanId);
  return Response.json({ job, xRequests: 0 });
}
