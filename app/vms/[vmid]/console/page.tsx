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

interface ClusterVmResource {
  vmid: number;
  node?: string;
  name?: string;
  status?: string;
  type?: string;
}

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

export default function VmConsolePage() {
  const { t } = useTranslation();
  const params = useParams<{ vmid: string }>();
  const router = useRouter();
  const [vmName, setVmName] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<VncSession | null>(null);

  const vmid = useMemo(() => Number(params.vmid), [params.vmid]);

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
    if (!Number.isFinite(vmid)) return;

    let cancelled = false;
    setError(null);
    setStatus("connecting");
    setSession(null);

    const connect = async () => {
      try {
        const [resources, config] = await Promise.all([
          fetchJson<ClusterVmResource[]>("/api/proxmox/cluster/resources?type=vm"),
          fetchJson<ConfigResponse>("/api/config"),
        ]);

        const resource = (resources ?? []).find(
          (r) => r.type === "qemu" && r.vmid === vmid && r.node,
        );
        if (!resource?.node) throw new Error(`VM ${vmid} not found`);
        if (resource.status !== "running") throw new Error(`VM ${vmid} is not running`);

        setVmName(resource.name ?? null);
        if (cancelled) return;

        const relayHost = window.location.hostname;
        const wsUrl = `ws://${relayHost}:${config.wsRelayPort}/?node=${resource.node}&vmid=${vmid}&type=qemu`;

        const consoleRes = await fetch("/api/console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ node: resource.node, vmid, vmtype: "qemu" }),
        });
        const consoleData = await consoleRes.json();
        if (consoleData.error) throw new Error(consoleData.error);

        if (cancelled) return;
        setSession({ wsUrl, vncPassword: consoleData.vncTicket });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("console.failedToConnect"));
        setStatus("error");
      }
    };

    void connect();
    return () => { cancelled = true; };
  }, [vmid, attempt]);

  const title = vmName ? `${vmName} (${vmid})` : `${t("dashboard.virtualMachines")} ${vmid}`;

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
            <Button onClick={() => router.push(`/vms/${vmid}`)}>{t("console.backToVm")}</Button>
          </SpaceBetween>
        }
      >
        {title} — {t("console.console")}
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
