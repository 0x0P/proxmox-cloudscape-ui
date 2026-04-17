import { NextResponse } from "next/server";
import { PVE_SESSION_COOKIE } from "@/app/lib/pve-session";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: PVE_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
