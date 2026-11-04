import { connection } from "next/server";
import { previewScan } from "@/lib/intel/run";

function deskRead(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "Open this from the desk.";
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return "Open this from the desk.";
    } catch {
      return "Open this from the desk.";
    }
  }
  return null;
}

export async function GET(request: Request) {
  await connection();
  const rejected = deskRead(request);
  if (rejected) return Response.json({ ready: false, message: rejected }, { status: 403 });
  return Response.json(await previewScan());
}
