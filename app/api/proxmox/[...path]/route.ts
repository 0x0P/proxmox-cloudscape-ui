import { type NextRequest } from "next/server";
import { PVE_SESSION_COOKIE, parsePveSession } from "@/app/lib/pve-session";

const PROXMOX_HOST = process.env.PROXMOX_HOST ?? "";
const TOKEN_ID = process.env.PROXMOX_TOKEN_ID ?? "";
const TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET ?? "";

async function proxyRequest(request: NextRequest, path: string) {
  if (!PROXMOX_HOST) {
    return Response.json({ error: "PROXMOX_HOST not configured" }, { status: 500 });
  }

  const url = `${PROXMOX_HOST}/api2/json/${path}${request.nextUrl.search}`;
  const contentType = request.headers.get("content-type");
  const session = parsePveSession(request.cookies.get(PVE_SESSION_COOKIE)?.value);

  const body = request.method !== "GET" ? await request.arrayBuffer() : undefined;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(request.method !== "GET" && contentType ? { "Content-Type": contentType } : {}),
  };

  if (session) {
    headers.Cookie = `PVEAuthCookie=${session.ticket}`;

    if (["POST", "PUT", "DELETE"].includes(request.method)) {
      headers.CSRFPreventionToken = session.csrfToken;
    }
  } else {
    if (!TOKEN_ID || !TOKEN_SECRET) {
      return Response.json({ error: "Proxmox API credentials not configured" }, { status: 500 });
    }

    headers.Authorization = `PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}`;
  }

  const res = await fetch(url, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  const data = await res.text();

  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path.join("/"));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path.join("/"));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path.join("/"));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path.join("/"));
}
