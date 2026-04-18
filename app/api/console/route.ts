import { type NextRequest } from "next/server";
import { PVE_SESSION_COOKIE, parsePveSession } from "@/app/lib/pve-session";

const PROXMOX_HOST = process.env.PROXMOX_HOST ?? "";
const PROXMOX_USER = process.env.PROXMOX_USER ?? "root@pam";
const PROXMOX_PASSWORD = process.env.PROXMOX_PASSWORD ?? "";

export async function POST(request: NextRequest) {
  const { node, vmid, vmtype } = await request.json();
  const session = parsePveSession(request.cookies.get(PVE_SESSION_COOKIE)?.value);

  if (!node || !vmid) {
    return Response.json({ error: "Missing node or vmid" }, { status: 400 });
  }

  if (!PROXMOX_HOST) {
    return Response.json({ error: "PROXMOX_HOST not configured" }, { status: 500 });
  }

  if (!session && !PROXMOX_PASSWORD) {
    return Response.json({ error: "PROXMOX_PASSWORD not configured" }, { status: 500 });
  }

  let ticket = session?.ticket;
  let csrf = session?.csrfToken;

  if (!ticket || !csrf) {
    const ticketRes = await fetch(`${PROXMOX_HOST}/api2/json/access/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: PROXMOX_USER, password: PROXMOX_PASSWORD }).toString(),
    });

    if (!ticketRes.ok) {
      return Response.json({ error: "Auth failed" }, { status: 401 });
    }

    const ticketJson = await ticketRes.json();
    ticket = ticketJson.data.ticket;
    csrf = ticketJson.data.CSRFPreventionToken;
  }

  const endpoint = vmtype === "lxc" ? "lxc" : "qemu";
  const headers: Record<string, string> = {
    Cookie: `PVEAuthCookie=${ticket}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (csrf) {
    headers.CSRFPreventionToken = csrf;
  }

  const vncRes = await fetch(
    `${PROXMOX_HOST}/api2/json/nodes/${node}/${endpoint}/${vmid}/vncproxy`,
    {
      method: "POST",
      headers,
      body: "websocket=1",
    },
  );

  if (!vncRes.ok) {
    const text = await vncRes.text();
    return Response.json({ error: `vncproxy failed: ${text}` }, { status: vncRes.status });
  }

  const vncJson = await vncRes.json();

  return Response.json({
    vncTicket: vncJson.data.ticket,
    port: vncJson.data.port,
    authTicket: ticket,
  });
}
