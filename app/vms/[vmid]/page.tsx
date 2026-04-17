"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import AreaChart from "@cloudscape-design/components/area-chart";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Modal from "@cloudscape-design/components/modal";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import Textarea from "@cloudscape-design/components/textarea";
import { useTranslation } from "@/app/lib/use-translation";

interface ClusterVmResource {
  vmid: number;
  node?: string;
  name?: string;
  status?: string;
  type?: string;
}

interface VmStatus {
  vmid: number;
  name?: string;
  status: string;
  cpus?: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
}

interface VmRrdPoint {
  time: number;
  cpu?: number;
  memused?: number;
  memtotal?: number;
}

interface VmSnapshot {
  name: string;
  description?: string;
  snaptime?: number;
  vmstate?: boolean | number;
}

interface VmTask {
  upid: string;
  starttime: number;
  type: string;
  status?: string;
  user: string;
}

type VmConfigValue = string | number | boolean;
type VmConfig = Record<string, VmConfigValue | null | undefined>;

interface VmDetailData {
  node: string;
  status: VmStatus;
  rrd: VmRrdPoint[];
  config: VmConfig;
  snapshots: VmSnapshot[];
  tasks: VmTask[];
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
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

function getVmStatusType(status?: string) {
  if (status === "running") {
    return "success" as const;
  }
  if (status === "stopped") {
    return "stopped" as const;
  }
  if (status === "paused") {
    return "warning" as const;
  }
  return "info" as const;
}

function formatConfigValue(key: string, value: VmConfigValue, t: (key: string) => string): string {
  if (typeof value === "boolean") {
    return value ? t("network.yes") : t("network.no");
  }
  if (typeof value === "number") {
    if (key === "memory") {
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

function getConfigStringValue(value: VmConfigValue | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function getDiskOptions(config: VmConfig): ReadonlyArray<SelectProps.Option> {
  return Object.entries(config)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .filter(([key, value]) => /^(ide|sata|scsi|virtio)\d+$/i.test(key) && typeof value === "string" && !value.includes("media=cdrom"))
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, undefined, { numeric: true }))
    .map(([key, value]) => ({
      label: `${key} (${value})`,
      value: key,
    }));
}

function getHardwareItems(config: VmConfig, t: (key: string) => string) {
  return Object.entries(config)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .filter(([key]) => key !== "digest")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, undefined, { numeric: true }))
    .map(([key, value]) => ({
      label: labelForConfigKey(key),
      value: formatConfigValue(key, value as VmConfigValue, t),
    }));
}

async function fetchProxmox<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => null)) as { data?: T | string } | null;

  if (!response.ok) {
    throw new Error(typeof json?.data === "string" ? json.data : `Request failed with status ${response.status}`);
  }

  return json?.data as T;
}

export default function VirtualMachineDetailPage(props: { params: Promise<{ vmid: string }> }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { vmid } = use(props.params);
  const [activeTabId, setActiveTabId] = useState("summary");
  const [data, setData] = useState<VmDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | "reboot" | null>(null);
  const [flashbarItems, setFlashbarItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [resizeModalVisible, setResizeModalVisible] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [resizingDisk, setResizingDisk] = useState(false);
  const [editCores, setEditCores] = useState("");
  const [editSockets, setEditSockets] = useState("");
  const [editMemory, setEditMemory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [selectedDisk, setSelectedDisk] = useState<SelectProps.Option | null>(null);
  const [diskSizeGb, setDiskSizeGb] = useState("");

  const numericVmid = Number(vmid);

  const loadVm = useCallback(async () => {
    if (!Number.isFinite(numericVmid)) {
      setLoadError(t("vms.invalidVmid"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setActionError(null);
      const resources = await fetchProxmox<ClusterVmResource[]>("/api/proxmox/cluster/resources?type=vm");
      const resource = (resources ?? []).find((item) => item.type === "qemu" && item.vmid === numericVmid && item.node);

      if (!resource?.node) {
        throw new Error(t("vms.failedToLoadDetails"));
      }

      const [status, rrd, config, snapshots, tasks] = await Promise.all([
        fetchProxmox<VmStatus>(`/api/proxmox/nodes/${resource.node}/qemu/${numericVmid}/status/current`),
        fetchProxmox<VmRrdPoint[]>(`/api/proxmox/nodes/${resource.node}/qemu/${numericVmid}/rrddata?timeframe=hour&cf=AVERAGE`),
        fetchProxmox<VmConfig>(`/api/proxmox/nodes/${resource.node}/qemu/${numericVmid}/config`),
        fetchProxmox<VmSnapshot[]>(`/api/proxmox/nodes/${resource.node}/qemu/${numericVmid}/snapshot`),
        fetchProxmox<VmTask[]>(`/api/proxmox/nodes/${resource.node}/tasks?vmid=${numericVmid}&limit=20`),
      ]);

      setData({
        node: resource.node,
        status: {
          ...status,
          name: status.name ?? resource.name,
        },
        rrd: rrd ?? [],
        config: config ?? {},
        snapshots: snapshots ?? [],
        tasks: tasks ?? [],
      });
      setLoadError(null);
    } catch (fetchError) {
      setLoadError(fetchError instanceof Error ? fetchError.message : t("vms.failedToLoadDetails"));
    } finally {
      setLoading(false);
    }
  }, [numericVmid, t]);

  useEffect(() => {
    void loadVm();
  }, [loadVm]);

  const selectedStatus = data?.status.status;
  const canStart = selectedStatus === "stopped" && !actionLoading;
  const canStop = selectedStatus === "running" && !actionLoading;
  const canReboot = selectedStatus === "running" && !actionLoading;
  const canOpenConsole = selectedStatus === "running" && !actionLoading;

  const runPowerAction = useCallback(
    async (action: "start" | "stop" | "reboot") => {
      if (!data) {
        return;
      }

      const expectedStatus = action === "stop" ? "stopped" : "running";

      try {
        setActionLoading(action);
        setActionError(null);
        await fetchProxmox(`/api/proxmox/nodes/${data.node}/qemu/${numericVmid}/status/${action}`, {
          method: "POST",
          body: JSON.stringify({}),
        });

        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const resources = await fetchProxmox<ClusterVmResource[]>("/api/proxmox/cluster/resources?type=vm");
            const resource = (resources ?? []).find((item) => item.type === "qemu" && item.vmid === numericVmid);
            if (resource) {
              const transitioned = action === "reboot"
                ? resource.status === "running"
                : resource.status === expectedStatus;

              if (transitioned) {
                await loadVm();
                break;
              }
            }
        } catch {
          void 0;
        }
      }
    } catch (actionError) {
        setActionError(actionError instanceof Error ? actionError.message : t("vms.failedAction").replace("{action}", action));
      } finally {
        setActionLoading(null);
      }
    },
    [data, loadVm, numericVmid, t],
  );

  const openEditModal = useCallback(() => {
    if (!data) {
      return;
    }

    setEditCores(getConfigStringValue(data.config.cores));
    setEditSockets(getConfigStringValue(data.config.sockets));
    setEditMemory(getConfigStringValue(data.config.memory));
    setEditDescription(getConfigStringValue(data.config.description));
    setConfigError(null);
    setEditModalVisible(true);
  }, [data]);

  const openResizeModal = useCallback(() => {
    if (!data) {
      return;
    }

    const diskOptions = getDiskOptions(data.config);
    setSelectedDisk(diskOptions[0] ?? null);
    setDiskSizeGb("");
    setConfigError(null);
    setResizeModalVisible(true);
  }, [data]);

  const saveConfiguration = useCallback(async () => {
    if (!data) {
      return;
    }

    const cores = Number(editCores);
    const sockets = Number(editSockets);
    const memory = Number(editMemory);

    if (!Number.isFinite(cores) || cores <= 0 || !Number.isFinite(sockets) || sockets <= 0 || !Number.isFinite(memory) || memory <= 0) {
      setConfigError(t("vms.coresSocketsMemoryError"));
      return;
    }

    try {
      setSavingConfig(true);
      setConfigError(null);

      const body = new URLSearchParams({
        cores: String(cores),
        sockets: String(sockets),
        memory: String(memory),
        description: editDescription,
      });

      await fetchProxmox(`/api/proxmox/nodes/${data.node}/qemu/${numericVmid}/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      setFlashbarItems([
        {
          type: "success",
          content: t("vms.configUpdated").replace("{id}", String(numericVmid)),
          dismissible: true,
          id: "vm-config-updated",
        },
      ]);
      setEditModalVisible(false);
      await loadVm();
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : t("vms.failedToUpdateConfig"));
    } finally {
      setSavingConfig(false);
    }
  }, [data, editCores, editDescription, editMemory, editSockets, loadVm, numericVmid, t]);

  const resizeVmDisk = useCallback(async () => {
    if (!data) {
      return;
    }

    const size = Number(diskSizeGb);
    const disk = selectedDisk?.value ?? "";

    if (!disk) {
      setConfigError(t("vms.selectDiskError"));
      return;
    }

    if (!Number.isFinite(size) || size <= 0) {
      setConfigError(t("vms.diskSizeError"));
      return;
    }

    try {
      setResizingDisk(true);
      setConfigError(null);

      const body = new URLSearchParams({
        disk,
        size: `${size}G`,
      });

      await fetchProxmox(`/api/proxmox/nodes/${data.node}/qemu/${numericVmid}/resize`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      setFlashbarItems([
        {
          type: "success",
          content: t("vms.diskResizeRequested").replace("{disk}", disk).replace("{id}", String(numericVmid)),
          dismissible: true,
          id: "vm-disk-resize-success",
        },
      ]);
      setResizeModalVisible(false);
      await loadVm();
    } catch (resizeError) {
      setConfigError(resizeError instanceof Error ? resizeError.message : t("vms.failedToResizeDisk"));
    } finally {
      setResizingDisk(false);
    }
  }, [data, diskSizeGb, loadVm, numericVmid, selectedDisk, t]);

  const snapshotsColumns = useMemo<TableProps<VmSnapshot>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: t("common.name"),
        cell: ({ name }) => name,
        isRowHeader: true,
      },
      {
        id: "description",
        header: t("vms.description"),
        cell: ({ description }) => description || "-",
      },
      {
        id: "date",
        header: t("vms.date"),
        cell: ({ snaptime }) => formatDateTime(snaptime),
      },
      {
        id: "vmstate",
        header: t("vms.vmState"),
        cell: ({ vmstate }) => (vmstate ? t("vms.included") : t("vms.noState")),
      },
    ],
    [t],
  );

  const tasksColumns = useMemo<TableProps<VmTask>["columnDefinitions"]>(
    () => [
      {
        id: "starttime",
        header: t("vms.startTime"),
        cell: ({ starttime }) => formatDateTime(starttime),
        isRowHeader: true,
      },
      {
        id: "type",
        header: t("logs.type"),
        cell: ({ type }) => type,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: ({ status }) => status ?? t("common.running"),
      },
      {
        id: "user",
        header: t("logs.user"),
        cell: ({ user }) => user,
      },
    ],
    [t],
  );

  if (!Number.isFinite(numericVmid)) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("vms.virtualMachines")}</Header>
        <Alert type="error" header={t("vms.invalidVmid")}>
          {t("vms.vmIdInvalid")}
        </Alert>
      </SpaceBetween>
    );
  }

  if (loading) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("vms.virtualMachines")} {numericVmid}</Header>
        <Box textAlign="center" padding={{ top: "xxxl" }}>
          <Spinner size="large" />
        </Box>
      </SpaceBetween>
    );
  }

  if (loadError || !data) {
    return (
      <SpaceBetween size="m">
        <Header variant="h1">{t("vms.virtualMachines")} {numericVmid}</Header>
        <Alert type="error" header={t("vms.failedToLoadDetails")}>
          {loadError ?? t("nodeDetail.unknownError")}
        </Alert>
      </SpaceBetween>
    );
  }

  const summaryItems = [
    { label: t("vms.vmid"), value: String(data.status.vmid) },
    { label: t("vms.name"), value: data.status.name ?? "-" },
    { label: t("vms.node"), value: data.node },
    {
      label: t("common.status"),
      value: (
        <StatusIndicator type={getVmStatusType(data.status.status)}>
          {data.status.status === "running" ? t("common.running") : data.status.status === "stopped" ? t("common.stopped") : data.status.status}
        </StatusIndicator>
      ),
    },
    { label: t("vms.cpu"), value: `${((data.status.cpu ?? 0) * 100).toFixed(1)}%` },
    { label: t("vms.memory"), value: `${formatBytes(data.status.mem ?? 0)} / ${formatBytes(data.status.maxmem ?? 0)}` },
    { label: t("vms.disk"), value: `${formatBytes(data.status.disk ?? 0)} / ${formatBytes(data.status.maxdisk ?? 0)}` },
    { label: t("vms.uptime"), value: formatUptime(data.status.uptime ?? 0) },
  ];

  const hardwareItems = getHardwareItems(data.config, t);
  const diskOptions = getDiskOptions(data.config);
  const cpuSeries = data.rrd.map((point) => ({ x: new Date(point.time * 1000), y: Math.round((point.cpu ?? 0) * 1000) / 10 }));
  const memorySeries = data.rrd.map((point) => ({
    x: new Date(point.time * 1000),
    y: point.memtotal ? Math.round(((point.memused ?? 0) / point.memtotal) * 1000) / 10 : 0,
  }));
  const chartDomain = cpuSeries.length > 1 ? [cpuSeries[0].x, cpuSeries[cpuSeries.length - 1].x] : undefined;

  const tabs: TabsProps.Tab[] = [
    {
      id: "summary",
      label: t("nodes.summary"),
      content: (
        <SpaceBetween size="l">
          <KeyValuePairs columns={4} items={summaryItems} />
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
            ariaLabel={`${t("nodeDetail.cpuAndMemoryUsage")} ${t("vms.virtualMachines")} ${numericVmid}`}
            empty={<Box textAlign="center" color="text-body-secondary">{t("vms.noPerformanceData")}</Box>}
          />
        </SpaceBetween>
      ),
    },
    {
      id: "hardware",
      label: t("vms.hardware"),
      content: (
        <SpaceBetween size="l">
          <Header
            variant="h2"
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button onClick={openEditModal}>{t("common.edit")}</Button>
                <Button onClick={openResizeModal} disabled={diskOptions.length === 0}>
                  {t("vms.resizeDisk")}
                </Button>
              </SpaceBetween>
            }
          >
            {t("vms.hardware")}
          </Header>
          {hardwareItems.length > 0 ? (
            <KeyValuePairs columns={4} items={hardwareItems} />
          ) : (
            <Box textAlign="center" color="text-body-secondary" padding="xxl">{t("vms.noHardwareConfig")}</Box>
          )}
        </SpaceBetween>
      ),
    },
    {
      id: "snapshots",
      label: t("vms.snapshots"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="name"
          items={data.snapshots}
          columnDefinitions={snapshotsColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("vms.noSnapshotsAvailable")}</Box>}
          header={<Header variant="h2" counter={`(${data.snapshots.length})`}>{t("vms.snapshots")}</Header>}
        />
      ),
    },
    {
      id: "tasks",
      label: t("vms.tasks"),
      content: (
        <Table
          variant="borderless"
          stickyHeader
          resizableColumns
          enableKeyboardNavigation
          trackBy="upid"
          items={data.tasks}
          columnDefinitions={tasksColumns}
          empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("vms.noRecentTasks")}</Box>}
          header={<Header variant="h2" counter={`(${data.tasks.length})`}>{t("logs.recentTasks")}</Header>}
        />
      ),
    },
  ];

  return (
    <SpaceBetween size="m">
      {flashbarItems.length > 0 ? <Flashbar items={flashbarItems} /> : null}
      {actionError ? (
        <Alert type="error" header={t("vms.actionFailed")}>
          {actionError}
        </Alert>
      ) : null}
      {configError ? (
        <Alert type="error" header={t("vms.configUpdateFailed")}>
          {configError}
        </Alert>
      ) : null}
      <Header
        variant="h1"
        description={`${t("vms.vmid")} ${numericVmid}`}
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <Button loading={actionLoading === "start"} disabled={!canStart} onClick={() => void runPowerAction("start")}>
              {t("vms.start")}
            </Button>
            <Button loading={actionLoading === "stop"} disabled={!canStop} onClick={() => void runPowerAction("stop")}>
              {t("vms.stop")}
            </Button>
            <Button loading={actionLoading === "reboot"} disabled={!canReboot} onClick={() => void runPowerAction("reboot")}>
              {t("vms.reboot")}
            </Button>
            <Button disabled={!canOpenConsole} onClick={() => router.push(`/vms/${numericVmid}/console`)}>
              {t("vms.console")}
            </Button>
            <Button iconName="refresh" disabled={!!actionLoading} onClick={() => void loadVm()}>
              {t("common.refresh")}
            </Button>
          </SpaceBetween>
        }
      >
        {`${data.status.name ?? `${t("vms.virtualMachines")} ${numericVmid}`} · ${t("vms.vmid")} ${numericVmid}`}
      </Header>
      <Tabs tabs={tabs} activeTabId={activeTabId} onChange={({ detail }) => setActiveTabId(detail.activeTabId)} />
      <Modal
        visible={editModalVisible}
        onDismiss={() => {
          setEditModalVisible(false);
          setConfigError(null);
        }}
        header={t("vms.editConfiguration")}
        closeAriaLabel={t("vms.editConfiguration")}
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
                {t("vms.saveChanges")}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label={t("vms.cpuCores")}>
            <Input type="number" value={editCores} onChange={({ detail }) => setEditCores(detail.value)} />
          </FormField>
          <FormField label={t("vms.cpuSockets")}>
            <Input type="number" value={editSockets} onChange={({ detail }) => setEditSockets(detail.value)} />
          </FormField>
          <FormField label={t("vms.memoryMb")}>
            <Input type="number" value={editMemory} onChange={({ detail }) => setEditMemory(detail.value)} />
          </FormField>
          <FormField label={t("vms.description")}>
            <Textarea value={editDescription} onChange={({ detail }) => setEditDescription(detail.value)} rows={4} />
          </FormField>
        </SpaceBetween>
      </Modal>
      <Modal
        visible={resizeModalVisible}
        onDismiss={() => {
          setResizeModalVisible(false);
          setConfigError(null);
        }}
        header={t("vms.resizeDisk")}
        closeAriaLabel={t("vms.resizeDisk")}
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button
                variant="link"
                onClick={() => {
                  setResizeModalVisible(false);
                  setConfigError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" loading={resizingDisk} onClick={() => void resizeVmDisk()}>
                {t("vms.resizeDisk")}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Alert type="info" header={t("vms.diskResizeNote")}>
            {t("vms.diskResizeInfo")}
          </Alert>
          <FormField label={t("vms.diskName")}>
            <Select
              selectedOption={selectedDisk}
              onChange={({ detail }) => setSelectedDisk(detail.selectedOption)}
              options={diskOptions}
              placeholder={t("vms.selectDisk")}
            />
          </FormField>
          <FormField label={t("vms.newSizeGb")}>
            <Input type="number" value={diskSizeGb} onChange={({ detail }) => setDiskSizeGb(detail.value)} />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
