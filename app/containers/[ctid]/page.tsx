"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import AreaChart from "@cloudscape-design/components/area-chart";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import Textarea from "@cloudscape-design/components/textarea";
import { useTranslation } from "@/app/lib/use-translation";

interface PveResource {
  vmid?: number;
  node: string;
  type: string;
  name?: string;
  status: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number;
}

type ContainerConfigValue = string | number | boolean;
type PveContainerConfig = Record<string, ContainerConfigValue | null | undefined>;

interface PveSnapshot {
  name: string;
  description?: string;
  snaptime?: number;
  vmstate?: number;
  parent?: string;
}

interface PveTask {
  upid: string;
  node: string;
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

interface ContainerDetailData {
  resource: PveResource;
  config: PveContainerConfig;
  snapshots: PveSnapshot[];
  tasks: PveTask[];
  rrd: PveRrdPoint[];
}

interface NetworkInterfaceRow {
  id: string;
  interface: string;
  bridge: string;
  macAddress: string;
  ip: string;
  firewall: string;
  rateLimit: string;
  vlanTag: string;
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
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

function formatConfigValue(key: string, value: ContainerConfigValue, yesLabel: string, noLabel: string): string {
  if (typeof value === "boolean") {
    return value ? yesLabel : noLabel;
  }
  if (typeof value === "number") {
    if (key === "memory" || key === "swap") {
      return formatBytes(value * 1024 * 1024);
    }
    return String(value);
  }
  return value;
}

function labelForConfigKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getStatusType(status: string) {
  if (status === "running") {
    return "success" as const;
  }
  if (status === "stopped") {
    return "stopped" as const;
  }
  return "info" as const;
}

function getConfigStringValue(value: ContainerConfigValue | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function parseNetworkConfigEntry(entry: string): Record<string, string> {
  return entry.split(",").reduce<Record<string, string>>((accumulator, part) => {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim();

    if (!key) {
      return accumulator;
    }

    accumulator[key] = rawValue.join("=").trim();
    return accumulator;
  }, {});
}

function getNetworkInterfaces(config: PveContainerConfig, yesLabel: string, noLabel: string): NetworkInterfaceRow[] {
  return Object.entries(config)
    .filter(([key, value]) => /^net\d+$/.test(key) && typeof value === "string" && value.length > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, undefined, { numeric: true }))
    .map(([key, value]) => {
      const parsed = parseNetworkConfigEntry(typeof value === "string" ? value : "");
      return {
        id: key,
        interface: parsed.name || key,
        bridge: parsed.bridge || "-",
        macAddress: parsed.hwaddr || "-",
        ip: parsed.ip || "-",
        firewall: parsed.firewall === "1" ? yesLabel : parsed.firewall === "0" || !parsed.firewall ? noLabel : parsed.firewall,
        rateLimit: parsed.rate || "-",
        vlanTag: parsed.tag || "-",
      };
    });
}

async function fetchProxmox<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
  });

  const json = (await response.json().catch(() => null)) as { data?: T | string } | null;

  if (!response.ok) {
    throw new Error(typeof json?.data === "string" ? json.data : `Request failed with status ${response.status}`);
  }

  return json?.data as T;
}

export default function ContainerDetailPage(props: { params: Promise<{ ctid: string }> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { ctid } = use(props.params);
  const vmid = Number(ctid);
  const [activeTabId, setActiveTabId] = useState("summary");
  const [data, setData] = useState<ContainerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | "reboot" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flashbarItems, setFlashbarItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [editCores, setEditCores] = useState("");
  const [editMemory, setEditMemory] = useState("");
  const [editSwap, setEditSwap] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const yesLabel = t("network.yes");
  const noLabel = t("network.no");

  const loadContainer = useCallback(async () => {
    if (!Number.isFinite(vmid)) {
      setLoadError(t("containers.invalidCtid"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setActionError(null);
      const resources = await fetchProxmox<PveResource[]>("/api/proxmox/cluster/resources?type=vm");
      const resource = (resources ?? []).find((item) => item.vmid === vmid && item.type === "lxc") ?? (resources ?? []).find((item) => item.vmid === vmid);

      if (!resource?.node) {
        throw new Error(`Container ${vmid} was not found`);
      }

      const [config, snapshots, tasks, rrd] = await Promise.all([
        fetchProxmox<PveContainerConfig>(`/api/proxmox/nodes/${resource.node}/lxc/${vmid}/config`),
        fetchProxmox<PveSnapshot[]>(`/api/proxmox/nodes/${resource.node}/lxc/${vmid}/snapshot`),
        fetchProxmox<PveTask[]>(`/api/proxmox/nodes/${resource.node}/tasks?vmid=${vmid}&limit=20`),
        fetchProxmox<PveRrdPoint[]>(`/api/proxmox/nodes/${resource.node}/lxc/${vmid}/rrddata?timeframe=hour&cf=AVERAGE`),
      ]);

      setData({
        resource,
        config: config ?? {},
        snapshots: snapshots ?? [],
        tasks: tasks ?? [],
        rrd: rrd ?? [],
      });
      setLoadError(null);
    } catch (fetchError) {
      setLoadError(fetchError instanceof Error ? fetchError.message : t("containers.failedToLoadDetails"));
    } finally {
      setLoading(false);
    }
  }, [t, vmid]);

  useEffect(() => {
    void loadContainer();
  }, [loadContainer]);

  const handlePowerAction = useCallback(
    async (action: "start" | "stop" | "reboot") => {
      if (!data) {
        return;
      }

      const expectedStatus = action === "stop" ? "stopped" : "running";

      try {
        setActionLoading(action);
        setActionError(null);
        await fetchProxmox(`/api/proxmox/nodes/${data.resource.node}/lxc/${vmid}/status/${action}`, {
          method: "POST",
        });

        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const resources = await fetchProxmox<PveResource[]>("/api/proxmox/cluster/resources?type=vm");
            const resource = (resources ?? []).find((item) => item.vmid === vmid && item.type === "lxc");
            if (resource) {
              const transitioned = action === "reboot"
                ? resource.status === "running"
                : resource.status === expectedStatus;

              if (transitioned) {
                await loadContainer();
                break;
              }
            }
          } catch {
            void 0;
          }
        }
      } catch (powerActionError) {
        setActionError(powerActionError instanceof Error ? powerActionError.message : `Failed to ${action} container`);
      } finally {
        setActionLoading(null);
      }
    },
    [data, loadContainer, vmid],
  );

  const openEditModal = useCallback(() => {
    if (!data) {
      return;
    }

    setEditCores(getConfigStringValue(data.config.cores));
    setEditMemory(getConfigStringValue(data.config.memory));
    setEditSwap(getConfigStringValue(data.config.swap));
    setEditDescription(getConfigStringValue(data.config.description));
    setConfigError(null);
    setEditModalVisible(true);
  }, [data]);

  const saveConfiguration = useCallback(async () => {
    if (!data) {
      return;
    }

    const cores = Number(editCores);
    const memory = Number(editMemory);
    const swap = Number(editSwap);

    if (!Number.isFinite(cores) || cores <= 0) {
      setConfigError("CPU cores must be greater than 0.");
      return;
    }

    if (!Number.isFinite(memory) || memory <= 0) {
      setConfigError("Memory must be greater than 0 MB.");
      return;
    }

    if (!Number.isFinite(swap) || swap < 0) {
      setConfigError("Swap must be 0 MB or greater.");
      return;
    }

    try {
      setSavingConfig(true);
      setConfigError(null);

      const body = new URLSearchParams({
        cores: String(cores),
        memory: String(memory),
        swap: String(swap),
        description: editDescription,
      });

      await fetchProxmox(`/api/proxmox/nodes/${data.resource.node}/lxc/${vmid}/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      setFlashbarItems([
        {
          type: "success",
          content: t("containers.configUpdated").replace("{id}", String(vmid)),
          dismissible: true,
          id: "container-config-updated",
          onDismiss: () => setFlashbarItems([]),
        },
      ]);
      setEditModalVisible(false);
      await loadContainer();
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : t("containers.failedToUpdateConfig"));
    } finally {
      setSavingConfig(false);
    }
  }, [data, editCores, editDescription, editMemory, editSwap, loadContainer, t, vmid]);

  const snapshotColumns = useMemo<TableProps<PveSnapshot>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: t("common.name"),
        cell: ({ name }) => name,
        isRowHeader: true,
      },
      {
        id: "parent",
        header: t("containers.parent"),
        cell: ({ parent }) => parent ?? "-",
      },
      {
        id: "snaptime",
        header: t("containers.created"),
        cell: ({ snaptime }) => formatDateTime(snaptime),
      },
      {
        id: "vmstate",
        header: t("containers.stateful"),
        cell: ({ vmstate }) => (vmstate ? yesLabel : noLabel),
      },
      {
        id: "description",
        header: t("containers.description"),
        cell: ({ description }) => description ?? "-",
      },
    ],
    [t],
  );

  const taskColumns = useMemo<TableProps<PveTask>["columnDefinitions"]>(
    () => [
      {
        id: "starttime",
        header: t("containers.started"),
        cell: ({ starttime }) => formatDateTime(starttime),
        isRowHeader: true,
      },
      {
        id: "endtime",
        header: t("containers.ended"),
        cell: ({ endtime }) => formatDateTime(endtime),
      },
      {
        id: "type",
        header: t("containers.task"),
        cell: ({ type, id }) => (id ? `${type} · ${id}` : type),
      },
      {
        id: "user",
        header: t("containers.user"),
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

  const networkColumns = useMemo<TableProps<NetworkInterfaceRow>["columnDefinitions"]>(
    () => [
      {
        id: "interface",
        header: t("containers.interface"),
        cell: ({ interface: interfaceName }) => interfaceName,
        isRowHeader: true,
      },
      {
        id: "bridge",
        header: t("containers.networkBridge"),
        cell: ({ bridge }) => bridge,
      },
      {
        id: "macAddress",
        header: t("containers.macAddress"),
        cell: ({ macAddress }) => macAddress,
      },
      {
        id: "ip",
        header: t("containers.ipAddress"),
        cell: ({ ip }) => ip,
      },
      {
        id: "firewall",
        header: t("containers.firewallEnabled"),
        cell: ({ firewall }) => firewall,
      },
      {
        id: "rateLimit",
        header: t("containers.rateLimit"),
        cell: ({ rateLimit }) => rateLimit,
      },
      {
        id: "vlanTag",
        header: t("containers.vlanTag"),
        cell: ({ vlanTag }) => vlanTag,
      },
    ],
    [t],
  );

  if (!Number.isFinite(vmid)) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("containers.containers")}</Header>
        <Alert type="error" header={t("containers.invalidCtid")}>
          {t("containers.ctidInvalid")}
        </Alert>
      </SpaceBetween>
    );
  }

  if (loading) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("containers.containers")} {vmid}</Header>
        <Box textAlign="center" padding={{ top: "xxxl" }}>
          <Spinner size="large" />
        </Box>
      </SpaceBetween>
    );
  }

  if (loadError || !data) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("containers.containers")} {vmid}</Header>
        <Alert type="error" header={t("containers.failedToLoadDetails")}>
          {loadError ?? t("containers.unknownError")}
        </Alert>
      </SpaceBetween>
    );
  }

  const { resource, config, snapshots, tasks, rrd } = data;
  const cpuSeries = rrd.map((point) => ({
    x: new Date(point.time * 1000),
    y: Math.round((point.cpu ?? 0) * 1000) / 10,
  }));
  const memorySeries = rrd.map((point) => ({
    x: new Date(point.time * 1000),
    y: point.memtotal ? Math.round(((point.memused ?? 0) / point.memtotal) * 1000) / 10 : 0,
  }));
  const configItems = Object.entries(config)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([label, value]) => ({
      label: labelForConfigKey(label),
      value: formatConfigValue(label, value as ContainerConfigValue, yesLabel, noLabel),
    }));
  const networkInterfaces = getNetworkInterfaces(config, yesLabel, noLabel);
  const summaryItems = [
    {
      label: t("containers.ctid"),
      value: String(vmid),
    },
    {
      label: t("common.name"),
      value: resource.name ?? "-",
    },
    {
      label: t("vms.node"),
      value: resource.node,
    },
    {
      label: t("common.status"),
      value: <StatusIndicator type={getStatusType(resource.status)}>{resource.status}</StatusIndicator>,
    },
    {
      label: t("common.cpuPercent"),
      value: `${((resource.cpu ?? 0) * 100).toFixed(1)}%`,
    },
    {
      label: t("containers.cpuCores"),
      value: String(resource.maxcpu ?? config.cores ?? "-"),
    },
    {
      label: t("common.memory"),
      value: `${formatBytes(resource.mem ?? 0)} / ${formatBytes(resource.maxmem ?? 0)}`,
    },
    {
      label: t("common.disk"),
      value: `${formatBytes(resource.disk ?? 0)} / ${formatBytes(resource.maxdisk ?? 0)}`,
    },
    {
      label: t("common.uptime"),
      value: formatUptime(resource.uptime ?? 0),
    },
    {
      label: t("containers.hostname"),
      value: getConfigStringValue(config.hostname) || "-",
    },
  ];
  const startDisabled = resource.status === "running" || actionLoading !== null;
  const stopDisabled = resource.status !== "running" || actionLoading !== null;
  const rebootDisabled = resource.status !== "running" || actionLoading !== null;
  const consoleDisabled = resource.status !== "running" || actionLoading !== null;
  const chartDomain = cpuSeries.length > 1 ? [cpuSeries[0].x, cpuSeries[cpuSeries.length - 1].x] : undefined;
  const tabs: TabsProps.Tab[] = [
    {
      id: "summary",
      label: t("containers.summary"),
      content: (
        <SpaceBetween size="l">
          <ColumnLayout columns={1}>
            <KeyValuePairs columns={4} items={summaryItems} />
          </ColumnLayout>
          <SpaceBetween size="s">
            <Header variant="h2">{t("containers.performance")}</Header>
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
              xDomain={chartDomain}
              i18nStrings={{
                xTickFormatter: (value) => (value as Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                yTickFormatter: (value) => `${value}%`,
              }}
              ariaLabel={`${t("containers.performance")} ${t("containers.containers")} ${vmid}`}
              empty={<Box textAlign="center" color="text-body-secondary">{t("containers.noPerformanceData")}</Box>}
            />
          </SpaceBetween>
        </SpaceBetween>
      ),
    },
    {
      id: "config",
      label: t("containers.config"),
      content: (
        <SpaceBetween size="s">
          <Header
            variant="h2"
            actions={
              <Button onClick={openEditModal} disabled={savingConfig}>
                {t("common.edit")}
              </Button>
            }
          >
            {t("containers.configuration")}
          </Header>
          {configItems.length > 0 ? (
            <KeyValuePairs columns={3} items={configItems} />
          ) : (
            <Box textAlign="center" color="text-body-secondary" padding="xxl">{t("containers.noConfigAvailable")}</Box>
          )}
        </SpaceBetween>
      ),
    },
    {
      id: "network",
      label: t("containers.network"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="id"
          items={networkInterfaces}
          columnDefinitions={networkColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("containers.noNetworkInterfacesAvailable")}</Box>}
          header={<Header variant="h2" counter={`(${networkInterfaces.length})`}>{t("containers.networkInterfaces")}</Header>}
        />
      ),
    },
    {
      id: "snapshots",
      label: t("containers.snapshots"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="name"
          items={snapshots}
          columnDefinitions={snapshotColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("containers.noSnapshotsAvailable")}</Box>}
          header={<Header variant="h2" counter={`(${snapshots.length})`}>{t("containers.snapshots")}</Header>}
        />
      ),
    },
    {
      id: "tasks",
      label: t("containers.tasks"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="upid"
          items={tasks}
          columnDefinitions={taskColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("containers.noRecentTasks")}</Box>}
          header={<Header variant="h2" counter={`(${tasks.length})`}>{t("logs.recentTasks")}</Header>}
        />
      ),
    },
  ];

  return (
    <SpaceBetween size="m">
      {flashbarItems.length > 0 ? <Flashbar items={flashbarItems} /> : null}
      {actionError ? (
        <Alert type="error" header={t("containers.failedRequest")} dismissible onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <Header
        variant="h1"
        description={`${t("containers.ctid")} ${vmid}`}
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <Button loading={actionLoading === "start"} disabled={startDisabled} onClick={() => void handlePowerAction("start")}>
              {t("containers.start")}
            </Button>
            <Button loading={actionLoading === "stop"} disabled={stopDisabled} onClick={() => void handlePowerAction("stop")}>
              {t("containers.stop")}
            </Button>
            <Button loading={actionLoading === "reboot"} disabled={rebootDisabled} onClick={() => void handlePowerAction("reboot")}>
              {t("containers.reboot")}
            </Button>
            <Button disabled={consoleDisabled} onClick={() => router.push(`/containers/${vmid}/console`)}>
              {t("containers.console")}
            </Button>
            <Button iconName="refresh" disabled={actionLoading !== null} onClick={() => void loadContainer()}>
              {t("common.refresh")}
            </Button>
          </SpaceBetween>
        }
      >
        {(resource.name ?? `${t("containers.containers")} ${vmid}`) + ` · ${t("containers.ctid")} ${vmid}`}
      </Header>
      <Tabs tabs={tabs} activeTabId={activeTabId} onChange={({ detail }) => setActiveTabId(detail.activeTabId)} />
      <Modal
        visible={editModalVisible}
        onDismiss={() => {
          setEditModalVisible(false);
          setConfigError(null);
        }}
        header={t("containers.editConfiguration")}
        closeAriaLabel="Close edit configuration modal"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button
                variant="link"
                onClick={() => {
                  setEditModalVisible(false);
                  setConfigError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" loading={savingConfig} onClick={() => void saveConfiguration()}>
                {t("containers.saveChanges")}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {configError ? (
            <Alert type="error" header={t("containers.failedToUpdateConfig")}>
              {configError}
            </Alert>
          ) : null}
          <FormField label={t("containers.cpuCores")}>
            <Input type="number" value={editCores} onChange={({ detail }) => setEditCores(detail.value)} />
          </FormField>
          <FormField label={t("containers.memoryMb")}>
            <Input type="number" value={editMemory} onChange={({ detail }) => setEditMemory(detail.value)} />
          </FormField>
          <FormField label={t("containers.swapMb")}>
            <Input type="number" value={editSwap} onChange={({ detail }) => setEditSwap(detail.value)} />
          </FormField>
          <FormField label={t("containers.description")}>
            <Textarea value={editDescription} onChange={({ detail }) => setEditDescription(detail.value)} rows={4} />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
