"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import AreaChart from "@cloudscape-design/components/area-chart";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTranslation } from "@/app/lib/use-translation";

interface PveNodeStatus {
  node?: string;
  status?: string;
  cpu?: number;
  cpuinfo?: { cpus?: number; cores?: number; model?: string; sockets?: number };
  memory?: { total?: number; used?: number; free?: number };
  rootfs?: { total?: number; used?: number; free?: number; avail?: number };
  swap?: { total?: number; used?: number; free?: number };
  uptime?: number;
  loadavg?: number[] | string;
  kversion?: string;
  pveversion?: string;
  [key: string]: unknown;
}

interface PveNetwork {
  iface: string;
  type: string;
  active?: number;
  autostart?: number;
  method?: string;
  method6?: string;
  address?: string;
  cidr?: string;
  gateway?: string;
  comments?: string;
}

interface PveStorage {
  storage: string;
  type: string;
  content: string;
  status?: string;
  total?: number;
  used?: number;
}

interface PveTask {
  upid: string;
  type: string;
  id?: string;
  user: string;
  status?: string;
  starttime: number;
  endtime?: number;
}

interface PveRrdPoint {
  time: number;
  cpu?: number;
  memused?: number;
  memtotal?: number;
}

interface NodeDetailData {
  status: PveNodeStatus;
  network: PveNetwork[];
  storage: PveStorage[];
  tasks: PveTask[];
  rrd: PveRrdPoint[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h`;
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

function getUsagePercent(used?: number, total?: number) {
  if (!used || !total) {
    return 0;
  }
  return Math.round((used / total) * 100);
}

async function fetchProxmox<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const json = (await response.json()) as { data?: T };
  return json.data as T;
}

export default function NodeDetailPage() {
  const params = useParams<{ node: string }>();
  const node = Array.isArray(params.node) ? params.node[0] : params.node;
  const [activeTabId, setActiveTabId] = useState("summary");
  const [data, setData] = useState<NodeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const loadNode = useCallback(async () => {
    if (!node) {
      return;
    }

    try {
      setLoading(true);
      const [status, network, storage, tasks, rrd] = await Promise.all([
        fetchProxmox<PveNodeStatus>(`/api/proxmox/nodes/${node}/status`),
        fetchProxmox<PveNetwork[]>(`/api/proxmox/nodes/${node}/network`),
        fetchProxmox<PveStorage[]>(`/api/proxmox/nodes/${node}/storage`),
        fetchProxmox<PveTask[]>(`/api/proxmox/nodes/${node}/tasks?limit=50`),
        fetchProxmox<PveRrdPoint[]>(`/api/proxmox/nodes/${node}/rrddata?timeframe=hour&cf=AVERAGE`),
      ]);
      setData({
        status,
        network: network ?? [],
        storage: storage ?? [],
        tasks: tasks ?? [],
        rrd: rrd ?? [],
      });
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : t("nodeDetail.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [node, t]);

  useEffect(() => {
    void loadNode();
  }, [loadNode]);

  const networkColumns = useMemo<TableProps<PveNetwork>["columnDefinitions"]>(
    () => [
      {
        id: "iface",
        header: t("nodeDetail.interface"),
        cell: ({ iface }) => iface,
        isRowHeader: true,
      },
      {
        id: "type",
        header: t("nodeDetail.type"),
        cell: ({ type }) => type,
      },
      {
        id: "method",
        header: t("nodeDetail.method"),
        cell: ({ method, method6 }) => [method, method6].filter(Boolean).join(" / ") || "-",
      },
      {
        id: "address",
        header: t("nodeDetail.address"),
        cell: ({ cidr, address }) => cidr ?? address ?? "-",
      },
      {
        id: "gateway",
        header: t("nodeDetail.gateway"),
        cell: ({ gateway }) => gateway ?? "-",
      },
      {
        id: "active",
        header: t("nodeDetail.active"),
        cell: ({ active }) => (
          <StatusIndicator type={active ? "success" : "error"}>{active ? t("nodeDetail.active") : t("nodeDetail.inactive")}</StatusIndicator>
        ),
      },
    ],
    [t],
  );

  const storageColumns = useMemo<TableProps<PveStorage>["columnDefinitions"]>(
    () => [
      {
        id: "storage",
        header: t("nodeDetail.storage"),
        cell: ({ storage }) => storage,
        isRowHeader: true,
      },
      {
        id: "type",
        header: t("nodeDetail.type"),
        cell: ({ type }) => type,
      },
      {
        id: "content",
        header: t("nodeDetail.content"),
        cell: ({ content }) => content,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: ({ status }) => status ?? "-",
      },
      {
        id: "usage",
        header: t("common.usage"),
        cell: ({ used, total }) => (
          <ProgressBar
            value={getUsagePercent(used, total)}
            additionalInfo={`${formatBytes(used ?? 0)} / ${formatBytes(total ?? 0)}`}
          />
        ),
      },
      {
        id: "capacity",
        header: t("nodeDetail.capacity"),
        cell: ({ total }) => formatBytes(total ?? 0),
      },
    ],
    [t],
  );

  const tasksColumns = useMemo<TableProps<PveTask>["columnDefinitions"]>(
    () => [
      {
        id: "starttime",
        header: t("nodeDetail.started"),
        cell: ({ starttime }) => formatDateTime(starttime),
        isRowHeader: true,
      },
      {
        id: "endtime",
        header: t("nodeDetail.ended"),
        cell: ({ endtime }) => formatDateTime(endtime),
      },
      {
        id: "type",
        header: t("nodeDetail.task"),
        cell: ({ type, id }) => id ? `${type} · ${id}` : type,
      },
      {
        id: "user",
        header: t("nodeDetail.user"),
        cell: ({ user }) => user,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: ({ status }) => status ?? t("common.running"),
      },
    ],
    [t],
  );

  if (!node) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("nodeDetail.invalidNode")}</Header>
        <Alert type="error" header={t("nodeDetail.invalidNode")}>
          {t("nodeDetail.nodeMissing")}
        </Alert>
      </SpaceBetween>
    );
  }

  if (loading) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{node}</Header>
        <Box textAlign="center" padding={{ top: "xxxl" }}>
          <Spinner size="large" />
        </Box>
      </SpaceBetween>
    );
  }

  if (error || !data) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{node}</Header>
        <Alert type="error" header={t("nodeDetail.failedToLoad")}>
          {error ?? t("nodeDetail.unknownError")}
        </Alert>
      </SpaceBetween>
    );
  }

  const st = data.status;
  const summaryItems = [
    {
      label: t("common.status"),
      value: <StatusIndicator type={st.status === "online" || st.cpu !== undefined ? "success" : "error"}>{st.status ?? t("common.online")}</StatusIndicator>,
    },
    {
      label: t("nodeDetail.cpuUsage"),
      value: `${((st.cpu ?? 0) * 100).toFixed(1)}%`,
    },
    {
      label: t("nodeDetail.cpuCores"),
      value: String(st.cpuinfo?.cpus ?? st.cpuinfo?.cores ?? "-"),
    },
    {
      label: t("nodeDetail.memory"),
      value: `${formatBytes(st.memory?.used ?? 0)} / ${formatBytes(st.memory?.total ?? 0)}`,
    },
    {
      label: t("nodeDetail.disk"),
      value: `${formatBytes(st.rootfs?.used ?? 0)} / ${formatBytes(st.rootfs?.total ?? 0)}`,
    },
    {
      label: t("nodeDetail.uptime"),
      value: formatUptime(st.uptime ?? 0),
    },
    {
      label: t("nodeDetail.loadAverage"),
      value: (() => {
        const la = st.loadavg;
        if (la == null) return "-";
        if (Array.isArray(la)) return la.map((v: number) => Number(v).toFixed(2)).join(" / ");
        return String(la);
      })(),
    },
  ];

  const cpuSeries = data.rrd.map((point) => ({
    x: new Date(point.time * 1000),
    y: Math.round((point.cpu ?? 0) * 1000) / 10,
  }));

  const memorySeries = data.rrd.map((point) => ({
    x: new Date(point.time * 1000),
    y: point.memtotal ? Math.round(((point.memused ?? 0) / point.memtotal) * 1000) / 10 : 0,
  }));

  const tabs: TabsProps.Tab[] = [
    {
      id: "summary",
      label: t("nodes.summary"),
      content: (
        <SpaceBetween size="l">
          <ColumnLayout columns={1}>
            <KeyValuePairs columns={3} items={summaryItems} />
          </ColumnLayout>
          <SpaceBetween size="s">
            <Header variant="h2">{t("nodeDetail.cpuAndMemoryUsage")}</Header>
            <AreaChart
              height={320}
              fitHeight
              series={[
                { title: t("nodeDetail.cpuPercent"), type: "area", data: cpuSeries },
                { title: t("nodeDetail.memoryPercent"), type: "area", data: memorySeries },
              ]}
              xScaleType="time"
              xTitle={t("common.time")}
              yTitle={t("common.usagePercent")}
              yDomain={[0, 100]}
              xDomain={cpuSeries.length > 1 ? [cpuSeries[0].x, cpuSeries[cpuSeries.length - 1].x] : undefined}
              i18nStrings={{
                xTickFormatter: (value) => (value as Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                yTickFormatter: (value) => `${value}%`,
              }}
              ariaLabel={`CPU and memory usage for ${node}`}
              empty={<Box textAlign="center" color="text-body-secondary">{t("nodeDetail.noPerformanceData")}</Box>}
            />
          </SpaceBetween>
        </SpaceBetween>
      ),
    },
    {
      id: "network",
      label: t("nodes.network"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="iface"
          items={data.network}
          columnDefinitions={networkColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("nodeDetail.noNetworkInterfaces")}</Box>}
          header={<Header variant="h2" counter={`(${data.network.length})`}>{t("nodeDetail.networkInterfaces")}</Header>}
        />
      ),
    },
    {
      id: "storage",
      label: t("nodeDetail.storage"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="storage"
          items={data.storage}
          columnDefinitions={storageColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("nodeDetail.noStorageAvailable")}</Box>}
          header={<Header variant="h2" counter={`(${data.storage.length})`}>{t("nodeDetail.storage")}</Header>}
        />
      ),
    },
    {
      id: "tasks",
      label: t("nodes.tasks"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="upid"
          items={data.tasks}
          columnDefinitions={tasksColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("nodeDetail.noRecentTasks")}</Box>}
          header={<Header variant="h2" counter={`(${data.tasks.length})`}>{t("logs.recentTasks")}</Header>}
        />
      ),
    },
  ];

  return (
    <SpaceBetween size="m">
      <Header
        variant="h1"
        actions={<Button iconName="refresh" onClick={() => void loadNode()}>{t("common.refresh")}</Button>}
      >
        {data.status.node || node}
      </Header>
      <Tabs
        tabs={tabs}
        activeTabId={activeTabId}
        onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
      />
    </SpaceBetween>
  );
}
