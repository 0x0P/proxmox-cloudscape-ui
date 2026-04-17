import { NextRequest, NextResponse } from "next/server";
import { PVE_SESSION_COOKIE } from "@/app/lib/pve-session";

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next") || /\.[^/]+$/.test(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login"
    || pathname.startsWith("/api/auth/")
    || isStaticAsset(pathname)
  ) {
    return NextResponse.next();
  }

  if (!request.cookies.get(PVE_SESSION_COOKIE)?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
