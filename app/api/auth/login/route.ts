import { NextResponse } from "next/server";
import { PVE_SESSION_COOKIE } from "@/app/lib/pve-session";

const PROXMOX_HOST = process.env.PROXMOX_HOST ?? "";

interface LoginBody {
  username?: string;
  password?: string;
  realm?: string;
}

interface ProxmoxTicketResponse {
  data?: {
    ticket?: string;
    CSRFPreventionToken?: string;
    username?: string;
  };
}

export async function POST(request: Request) {
  if (!PROXMOX_HOST) {
    return NextResponse.json({ error: "PROXMOX_HOST not configured" }, { status: 500 });
  }

  const body = (await request.json()) as LoginBody;
  const username = body.username?.trim();
  const password = body.password;
  const realm = body.realm?.trim();

  if (!username || !password || !realm) {
    return NextResponse.json({ error: "Username, password, and realm are required" }, { status: 400 });
  }

  const proxmoxResponse = await fetch(`${PROXMOX_HOST}/api2/json/access/ticket`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username: `${username}@${realm}`,
      password,
    }).toString(),
    cache: "no-store",
  });

  if (!proxmoxResponse.ok) {
    return NextResponse.json({ error: "Invalid Proxmox credentials" }, { status: 401 });
  }

  const proxmoxJson = (await proxmoxResponse.json()) as ProxmoxTicketResponse;
  const ticket = proxmoxJson.data?.ticket;
  const csrfToken = proxmoxJson.data?.CSRFPreventionToken;
  const proxmoxUsername = proxmoxJson.data?.username;

  if (!ticket || !csrfToken || !proxmoxUsername) {
    return NextResponse.json({ error: "Invalid Proxmox login response" }, { status: 502 });
  }

  const response = NextResponse.json({ username: proxmoxUsername, csrfToken });

  response.cookies.set({
    name: PVE_SESSION_COOKIE,
    value: JSON.stringify({ ticket, csrfToken, username: proxmoxUsername }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });

  return response;
}
