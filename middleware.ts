import { NextResponse } from "next/server";

/** No editor password gate. Pages and APIs are open to the deployment. Writes still require same-origin. */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
