import { NextRequest, NextResponse } from "next/server";
import { PVE_SESSION_COOKIE, parsePveSession } from "@/app/lib/pve-session";

export async function GET(request: NextRequest) {
  const session = parsePveSession(request.cookies.get(PVE_SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ username: session.username, authenticated: true });
}
