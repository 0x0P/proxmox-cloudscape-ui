import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const PROXMOX_HOST = process.env.PROXMOX_HOST ?? "";
const WS_PORT = Number(process.env.WS_RELAY_PORT ?? "3001");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${WS_PORT}`);
  const node = url.searchParams.get("node");
  const vmid = url.searchParams.get("vmid");
  const vmtype = url.searchParams.get("type") ?? "qemu";
  const authTicket = url.searchParams.get("authTicket");
  const vncTicket = url.searchParams.get("vncTicket");
  const port = url.searchParams.get("port");

  if (!node || !authTicket || !vncTicket || !port) {
    clientWs.close(4400, "Missing required params: node, authTicket, vncTicket, port");
    return;
  }

  if (vmtype !== "shell" && !vmid) {
    clientWs.close(4400, "Missing required param: vmid");
    return;
  }

  try {
    const hostUrl = new URL(PROXMOX_HOST);
    const wsProto = hostUrl.protocol === "http:" ? "ws:" : "wss:";
    let proxmoxWsUrl: string;

    if (vmtype === "shell") {
      proxmoxWsUrl =
        `${wsProto}//${hostUrl.host}/api2/json/nodes/${node}/vncwebsocket` +
        `?port=${port}&vncticket=${encodeURIComponent(vncTicket)}`;
    } else {
      const endpoint = vmtype === "lxc" ? "lxc" : "qemu";
      proxmoxWsUrl =
        `${wsProto}//${hostUrl.host}/api2/json/nodes/${node}/${endpoint}/${vmid}/vncwebsocket` +
        `?port=${port}&vncticket=${encodeURIComponent(vncTicket)}`;
    }

    const proxmoxWs = new WebSocket(proxmoxWsUrl, {
      headers: { Cookie: `PVEAuthCookie=${authTicket}` },
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
