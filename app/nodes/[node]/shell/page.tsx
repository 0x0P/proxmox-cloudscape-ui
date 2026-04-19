"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useTranslation } from "@/app/lib/use-translation";

const VncViewer = dynamic(() => import("@/app/components/vnc-viewer"), { ssr: false });

interface ConfigResponse {
  proxmoxHost: string;
  wsRelayPort: string;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  return (json.data ?? json) as T;
}

interface VncSession {
  wsUrl: string;
  vncPassword: string;
}

export default function NodeShellPage() {
  const { t } = useTranslation();
  const params = useParams<{ node: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<VncSession | null>(null);

  const node = useMemo(() => params.node, [params.node]);

  const handleConnect = useCallback(() => setStatus("connected"), []);
  const handleDisconnect = useCallback((clean: boolean) => {
    if (clean) {
      setStatus("disconnected");
    } else {
      setError(t("console.vncConnectionLost"));
      setStatus("error");
    }
  }, [t]);

  useEffect(() => {
    if (!node) return;

    let cancelled = false;
    setError(null);
    setStatus("connecting");
    setSession(null);

    const connect = async () => {
      try {
        const config = await fetchJson<ConfigResponse>("/api/config");

        if (cancelled) return;

        const consoleRes = await fetch("/api/console/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node }),
        });
        const consoleData = await consoleRes.json();
        if (consoleData.error) throw new Error(consoleData.error);

        if (cancelled) return;

        const relayHost = window.location.hostname;
        const wsParams = new URLSearchParams({
          node,
          type: "shell",
          authTicket: consoleData.authTicket,
          vncTicket: consoleData.vncTicket,
          port: String(consoleData.port),
        });
        const wsUrl = `ws://${relayHost}:${config.wsRelayPort}/?${wsParams.toString()}`;

        setSession({ wsUrl, vncPassword: consoleData.vncTicket });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("console.failedToConnect"));
        setStatus("error");
      }
    };

    void connect();
    return () => { cancelled = true; };
  }, [node, attempt, t]);

  const statusType = status === "connected"
    ? ("success" as const)
    : status === "connecting"
      ? ("in-progress" as const)
      : status === "error"
        ? ("error" as const)
        : ("stopped" as const);

  const statusLabel = status === "connected"
    ? t("console.connected")
    : status === "connecting"
      ? t("console.connecting")
      : status === "error"
        ? t("common.error")
        : t("console.disconnected");

  return (
    <SpaceBetween size="m">
      {error && <Alert type="error" header={t("console.consoleError")}>{error}</Alert>}
      <Header
        variant="h1"
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <StatusIndicator type={statusType}>{statusLabel}</StatusIndicator>
            <Button disabled={status === "connecting"} onClick={() => setAttempt((n) => n + 1)}>{t("console.reconnect")}</Button>
            <Button onClick={() => router.push(`/nodes/${node}`)}>{t("common.back")}</Button>
          </SpaceBetween>
        }
      >
        {node} — {t("nodeDetail.shell")}
      </Header>
      <Container>
        {status === "connecting" && !session && (
          <Box textAlign="center" padding="l"><Spinner size="large" /></Box>
        )}
        {session && (
          <VncViewer
            wsUrl={session.wsUrl}
            vncPassword={session.vncPassword}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        )}
      </Container>
    </SpaceBetween>
  );
}
