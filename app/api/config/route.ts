export async function GET() {
  return Response.json({
    proxmoxHost: process.env.PROXMOX_HOST ?? "",
    wsRelayPort: process.env.WS_RELAY_PORT ?? "3001",
  });
}
