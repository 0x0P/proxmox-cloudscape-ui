const { createServer } = require("http");
const { parse } = require("url");
const { WebSocketServer, WebSocket } = require("ws");
const next = require("next");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

const PROXMOX_HOST = process.env.PROXMOX_HOST ?? "";

function handleWsConnection(clientWs, req) {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const node = url.searchParams.get("node");
  const vmid = url.searchParams.get("vmid");
  const vmtype = url.searchParams.get("type") ?? "qemu";
  const authTicket = url.searchParams.get("authTicket");
  const vncTicket = url.searchParams.get("vncTicket");
  const wsPort = url.searchParams.get("port");

  if (!node || !authTicket || !vncTicket || !wsPort) {
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
    let proxmoxWsUrl;

    if (vmtype === "shell") {
      proxmoxWsUrl =
        `${wsProto}//${hostUrl.host}/api2/json/nodes/${node}/vncwebsocket` +
        `?port=${wsPort}&vncticket=${encodeURIComponent(vncTicket)}`;
    } else {
      const endpoint = vmtype === "lxc" ? "lxc" : "qemu";
      proxmoxWsUrl =
        `${wsProto}//${hostUrl.host}/api2/json/nodes/${node}/${endpoint}/${vmid}/vncwebsocket` +
        `?port=${wsPort}&vncticket=${encodeURIComponent(vncTicket)}`;
    }

    const proxmoxWs = new WebSocket(proxmoxWsUrl, ["binary"], {
      headers: { Cookie: `PVEAuthCookie=${authTicket}` },
      rejectUnauthorized: false,
      perMessageDeflate: false,
    });

    proxmoxWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        clientWs.send(buf);
      }
    });

    proxmoxWs.on("close", () => clientWs.close());
    proxmoxWs.on("error", () => clientWs.close(4502, "Proxmox VNC failed"));

    clientWs.on("message", (data) => {
      if (proxmoxWs.readyState === WebSocket.OPEN) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        proxmoxWs.send(buf);
      }
    });

    clientWs.on("close", () => proxmoxWs.close());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    clientWs.close(4500, msg);
  }
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  wss.on("connection", handleWsConnection);

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`> Server listening on port ${port}`);
    console.log(`> WebSocket relay available at /ws`);
  });
});
