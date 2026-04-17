import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const PROXMOX_HOST = process.env.PROXMOX_HOST ?? "";
const PROXMOX_USER = process.env.PROXMOX_USER ?? "root@pam";
const PROXMOX_PASSWORD = process.env.PROXMOX_PASSWORD ?? "";
const WS_PORT = Number(process.env.WS_RELAY_PORT ?? "3001");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const server = createServer();
const wss = new WebSocketServer({ server });

async function getAuthTicket(): Promise<{ ticket: string; csrf: string }> {
  const res = await fetch(`${PROXMOX_HOST}/api2/json/access/ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: PROXMOX_USER, password: PROXMOX_PASSWORD }).toString(),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const json = await res.json();
  return { ticket: json.data.ticket, csrf: json.data.CSRFPreventionToken };
}

wss.on("connection", async (clientWs, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${WS_PORT}`);
  const node = url.searchParams.get("node");
  const vmid = url.searchParams.get("vmid");
  const vmtype = url.searchParams.get("type") ?? "qemu";

  if (!node || !vmid) {
    clientWs.close(4400, "Missing node or vmid");
    return;
  }

  try {
    const auth = await getAuthTicket();
    const endpoint = vmtype === "lxc" ? "lxc" : "qemu";

    const vncRes = await fetch(
      `${PROXMOX_HOST}/api2/json/nodes/${node}/${endpoint}/${vmid}/vncproxy`,
      {
        method: "POST",
        headers: {
          Cookie: `PVEAuthCookie=${auth.ticket}`,
          CSRFPreventionToken: auth.csrf,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "websocket=1",
      },
    );

    if (!vncRes.ok) throw new Error(`vncproxy ${vncRes.status}`);
    const vncJson = await vncRes.json();
    const { port, ticket: vncTicket } = vncJson.data;

    const hostUrl = new URL(PROXMOX_HOST);
    const wsProto = hostUrl.protocol === "http:" ? "ws:" : "wss:";
    const proxmoxWsUrl =
      `${wsProto}//${hostUrl.host}/api2/json/nodes/${node}/${endpoint}/${vmid}/vncwebsocket` +
      `?port=${port}&vncticket=${encodeURIComponent(vncTicket)}`;

    const proxmoxWs = new WebSocket(proxmoxWsUrl, {
      headers: { Cookie: `PVEAuthCookie=${auth.ticket}` },
      rejectUnauthorized: false,
    });

    proxmoxWs.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        clientWs.send(buf);
      }
    });

    proxmoxWs.on("close", () => clientWs.close());
    proxmoxWs.on("error", () => clientWs.close(4502, "Proxmox VNC failed"));

    clientWs.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        proxmoxWs.send(buf);
      }
    });

    clientWs.on("close", () => proxmoxWs.close());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    clientWs.close(4500, msg);
  }
});

server.listen(WS_PORT, () => {
  console.log(`[ws-relay] VNC relay listening on port ${WS_PORT}`);
});
