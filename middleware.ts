import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie, sessionValid } from "@/lib/auth/token";

function isPublic(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname === "/api/auth/editor") return true;
  if (pathname.startsWith("/api/auth/x/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  const secret = process.env.EDITOR_SESSION_SECRET?.trim() ?? "";
  const token = request.cookies.get(sessionCookie)?.value;
  const signedIn = secret ? await sessionValid(secret, token, Date.now()) : false;
  if (signedIn) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    const message = secret ? "Sign in to the desk before changing anything." : "Editor sign-in is not configured.";
    return NextResponse.json({ ok: false, message }, { status: secret ? 401 : 503, headers: { "cache-control": "no-store" } });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
