import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWsRelayUrl } from "@/app/lib/ws-relay-url";

describe("buildWsRelayUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("targets the page origin when no relay port is configured", () => {
    const url = buildWsRelayUrl(
      { protocol: "http:", hostname: "localhost", host: "localhost:3000" },
      new URLSearchParams({ node: "n", type: "qemu" }),
    );

    expect(url).toBe("ws://localhost:3000/ws?node=n&type=qemu");
  });

  it("targets the relay port when NEXT_PUBLIC_WS_RELAY_PORT is set", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_RELAY_PORT", "3001");

    const url = buildWsRelayUrl(
      { protocol: "http:", hostname: "localhost", host: "localhost:3000" },
      new URLSearchParams({ node: "n", type: "qemu" }),
    );

    expect(url).toBe("ws://localhost:3001/ws?node=n&type=qemu");
  });

  it("prefers runtime relayPort over build-time env", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_RELAY_PORT", "3001");

    const url = buildWsRelayUrl(
      { protocol: "http:", hostname: "localhost", host: "localhost:3000" },
      new URLSearchParams({ node: "n", type: "qemu" }),
      "3002",
    );

    expect(url).toBe("ws://localhost:3002/ws?node=n&type=qemu");
  });

  it("uses wss on https origins", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_RELAY_PORT", "3001");

    const url = buildWsRelayUrl(
      { protocol: "https:", hostname: "example.com", host: "example.com:443" },
      new URLSearchParams({ node: "n", type: "qemu" }),
    );

    expect(url).toBe("wss://example.com:3001/ws?node=n&type=qemu");
  });
});
