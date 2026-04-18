"use client";

import { useCollection } from "@cloudscape-design/collection-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
import Pagination from "@cloudscape-design/components/pagination";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import TextFilter from "@cloudscape-design/components/text-filter";
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

interface PveNodeDnsConfig {
  search?: string;
  dns1?: string;
  dns2?: string;
  dns3?: string;
}

interface PveNodeTimeConfig {
  timezone?: string;
  localtime?: number;
  time?: number;
}

interface PveNodeSyslogEntry {
  n: number;
  t: string;
}

interface PveNodeService {
  service: string;
  name?: string;
  desc?: string;
  state?: string;
  "active-state"?: string;
  "unit-state"?: string;
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

function getBootMode(status: PveNodeStatus): string {
  const bootInfo = status["boot-info"];
  if (!bootInfo || typeof bootInfo !== "object") {
    return "-";
  }

  const mode = Reflect.get(bootInfo, "mode");
  return typeof mode === "string" && mode.length > 0 ? mode : "-";
}

function getServiceStateType(state?: string) {
  if (state === "running") {
    return "success" as const;
  }
  if (state === "dead" || state === "exited") {
    return "stopped" as const;
  }
  return "warning" as const;
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

export default function NodeDetailPage() {
  const params = useParams<{ node: string }>();
  const node = Array.isArray(params.node) ? params.node[0] : params.node;
  const [activeTabId, setActiveTabId] = useState("summary");
  const [data, setData] = useState<NodeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const [actionLoading, setActionLoading] = useState<"reboot" | "shutdown" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flashbarItems, setFlashbarItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [rebootModalVisible, setRebootModalVisible] = useState(false);
  const [shutdownModalVisible, setShutdownModalVisible] = useState(false);
  const [dnsConfig, setDnsConfig] = useState<PveNodeDnsConfig | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [dnsModalVisible, setDnsModalVisible] = useState(false);
  const [dnsSaving, setDnsSaving] = useState(false);
  const [dnsForm, setDnsForm] = useState<PveNodeDnsConfig>({ search: "", dns1: "", dns2: "", dns3: "" });
  const [timeConfig, setTimeConfig] = useState<PveNodeTimeConfig | null>(null);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [timeSaving, setTimeSaving] = useState(false);
  const [timezoneValue, setTimezoneValue] = useState("");
  const [syslogEntries, setSyslogEntries] = useState<PveNodeSyslogEntry[]>([]);
  const [syslogLoading, setSyslogLoading] = useState(false);
  const [syslogError, setSyslogError] = useState<string | null>(null);
  const [services, setServices] = useState<PveNodeService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceActionLoading, setServiceActionLoading] = useState<Record<string, "start" | "stop" | "restart" | null>>({});

  const loadNode = useCallback(async () => {
    if (!node) {
      return;
    }

    try {
      setLoading(true);
      setActionError(null);
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

  const loadDns = useCallback(async () => {
    if (!node) {
      return;
    }

    try {
      setDnsLoading(true);
      const config = await fetchProxmox<PveNodeDnsConfig>(`/api/proxmox/nodes/${node}/dns`);
      setDnsConfig(config ?? null);
      setDnsError(null);
    } catch (fetchError) {
      setDnsError(fetchError instanceof Error ? fetchError.message : t("nodeDetail.failedToLoadDns"));
    } finally {
      setDnsLoading(false);
    }
  }, [node, t]);

  const loadTime = useCallback(async () => {
    if (!node) {
      return;
    }

    try {
      setTimeLoading(true);
      const config = await fetchProxmox<PveNodeTimeConfig>(`/api/proxmox/nodes/${node}/time`);
      setTimeConfig(config ?? null);
      setTimeError(null);
    } catch (fetchError) {
      setTimeError(fetchError instanceof Error ? fetchError.message : t("nodeDetail.failedToLoadTime"));
    } finally {
      setTimeLoading(false);
    }
  }, [node, t]);

  const loadSyslog = useCallback(async () => {
    if (!node) {
      return;
    }

    try {
      setSyslogLoading(true);
      const entries = await fetchProxmox<PveNodeSyslogEntry[]>(`/api/proxmox/nodes/${node}/syslog?start=0&limit=500`);
      setSyslogEntries(entries ?? []);
      setSyslogError(null);
    } catch (fetchError) {
      setSyslogError(fetchError instanceof Error ? fetchError.message : t("nodeDetail.failedToLoadSyslog"));
    } finally {
      setSyslogLoading(false);
    }
  }, [node, t]);

  const loadServices = useCallback(async () => {
    if (!node) {
      return;
    }

    try {
      setServicesLoading(true);
      const serviceItems = await fetchProxmox<PveNodeService[]>(`/api/proxmox/nodes/${node}/services`);
      setServices(serviceItems ?? []);
      setServicesError(null);
    } catch (fetchError) {
      setServicesError(fetchError instanceof Error ? fetchError.message : t("nodeDetail.failedToLoadServices"));
    } finally {
      setServicesLoading(false);
    }
  }, [node, t]);

  useEffect(() => {
    if (activeTabId === "dns" && !dnsConfig && !dnsLoading && !dnsError) {
      void loadDns();
    }
    if (activeTabId === "time" && !timeConfig && !timeLoading && !timeError) {
      void loadTime();
    }
    if (activeTabId === "syslog" && syslogEntries.length === 0 && !syslogLoading && !syslogError) {
      void loadSyslog();
    }
    if (activeTabId === "services" && services.length === 0 && !servicesLoading && !servicesError) {
      void loadServices();
    }
  }, [
    activeTabId,
    dnsConfig,
    dnsError,
    dnsLoading,
    loadDns,
    loadServices,
    loadSyslog,
    loadTime,
    services.length,
    servicesError,
    servicesLoading,
    syslogEntries.length,
    syslogError,
    syslogLoading,
    timeConfig,
    timeError,
    timeLoading,
  ]);

  const openDnsModal = useCallback(() => {
    setDnsForm({
      search: dnsConfig?.search ?? "",
      dns1: dnsConfig?.dns1 ?? "",
      dns2: dnsConfig?.dns2 ?? "",
      dns3: dnsConfig?.dns3 ?? "",
    });
    setDnsError(null);
    setDnsModalVisible(true);
  }, [dnsConfig]);

  const openTimeModal = useCallback(() => {
    setTimezoneValue(timeConfig?.timezone ?? "");
    setTimeError(null);
    setTimeModalVisible(true);
  }, [timeConfig]);

  const pushFlash = useCallback((item: FlashbarProps.MessageDefinition) => {
    setFlashbarItems((current) => [...current.filter((entry) => entry.id !== item.id), item]);
  }, []);

  const runNodeAction = useCallback(async (action: "reboot" | "shutdown") => {
    if (!node) {
      return;
    }

    try {
      setActionLoading(action);
      setActionError(null);

      const body = new URLSearchParams({ command: action });
      await fetchProxmox(`/api/proxmox/nodes/${node}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      pushFlash({
        type: "success",
        content: t(action === "reboot" ? "nodeDetail.rebootSuccess" : "nodeDetail.shutdownSuccess").replace("{node}", node),
        dismissible: true,
        id: `node-${action}`,
      });

      setRebootModalVisible(false);
      setShutdownModalVisible(false);
      await loadNode();
    } catch (runError) {
      setActionError(runError instanceof Error ? runError.message : t(action === "reboot" ? "nodeDetail.failedToReboot" : "nodeDetail.failedToShutdown"));
    } finally {
      setActionLoading(null);
    }
  }, [loadNode, node, pushFlash, t]);

  const saveDns = useCallback(async () => {
    if (!node) {
      return;
    }

    const search = dnsForm.search?.trim() ?? "";
    if (!search) {
      setDnsError(t("nodeDetail.searchDomainRequired"));
      return;
    }

    try {
      setDnsSaving(true);
      setDnsError(null);

      const body = new URLSearchParams({
        search,
        dns1: dnsForm.dns1?.trim() ?? "",
        dns2: dnsForm.dns2?.trim() ?? "",
        dns3: dnsForm.dns3?.trim() ?? "",
      });

      await fetchProxmox(`/api/proxmox/nodes/${node}/dns`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      pushFlash({
        type: "success",
        content: t("nodeDetail.dnsUpdated"),
        dismissible: true,
        id: "node-dns-updated",
      });

      setDnsModalVisible(false);
      await loadDns();
    } catch (saveError) {
      setDnsError(saveError instanceof Error ? saveError.message : t("nodeDetail.failedToUpdateDns"));
    } finally {
      setDnsSaving(false);
    }
  }, [dnsForm, loadDns, node, pushFlash, t]);

  const saveTime = useCallback(async () => {
    if (!node) {
      return;
    }

    const timezone = timezoneValue.trim();
    if (!timezone) {
      setTimeError(t("nodeDetail.timezoneRequired"));
      return;
    }

    try {
      setTimeSaving(true);
      setTimeError(null);

      const body = new URLSearchParams({ timezone });

      await fetchProxmox(`/api/proxmox/nodes/${node}/time`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      pushFlash({
        type: "success",
        content: t("nodeDetail.timeUpdated"),
        dismissible: true,
        id: "node-time-updated",
      });

      setTimeModalVisible(false);
      await loadTime();
    } catch (saveError) {
      setTimeError(saveError instanceof Error ? saveError.message : t("nodeDetail.failedToUpdateTime"));
    } finally {
      setTimeSaving(false);
    }
  }, [loadTime, node, pushFlash, t, timezoneValue]);

  const runServiceAction = useCallback(async (service: string, action: "start" | "stop" | "restart") => {
    if (!node) {
      return;
    }

    try {
      setServiceActionLoading((current) => ({ ...current, [service]: action }));
      setServicesError(null);

      await fetchProxmox(`/api/proxmox/nodes/${node}/services/${service}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams().toString(),
      });

      const actionLabel = t(
        action === "start"
          ? "nodeDetail.startService"
          : action === "stop"
            ? "nodeDetail.stopService"
            : "nodeDetail.restartService",
      );

      pushFlash({
        type: "success",
        content: t("nodeDetail.serviceActionSuccess").replace("{service}", service).replace("{action}", actionLabel),
        dismissible: true,
        id: `service-${service}-${action}`,
      });

      await loadServices();
    } catch (runError) {
      const actionLabel = t(
        action === "start"
          ? "nodeDetail.startService"
          : action === "stop"
            ? "nodeDetail.stopService"
            : "nodeDetail.restartService",
      );
      setServicesError(
        runError instanceof Error
          ? runError.message
          : t("nodeDetail.failedServiceAction").replace("{service}", service).replace("{action}", actionLabel),
      );
    } finally {
      setServiceActionLoading((current) => ({ ...current, [service]: null }));
    }
  }, [loadServices, node, pushFlash, t]);

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

  const syslogColumns = useMemo<TableProps<PveNodeSyslogEntry>["columnDefinitions"]>(
    () => [
      {
        id: "n",
        header: t("nodeDetail.lineNumber"),
        cell: ({ n }) => String(n),
        isRowHeader: true,
        minWidth: 100,
      },
      {
        id: "t",
        header: t("nodeDetail.message"),
        cell: ({ t: message }) => message,
      },
    ],
    [t],
  );

  const servicesColumns = useMemo<TableProps<PveNodeService>["columnDefinitions"]>(
    () => [
      {
        id: "service",
        header: t("nodeDetail.serviceName"),
        cell: ({ service }) => service,
        isRowHeader: true,
      },
      {
        id: "desc",
        header: t("nodeDetail.serviceDescription"),
        cell: ({ desc, name }) => desc ?? name ?? "-",
      },
      {
        id: "state",
        header: t("nodeDetail.serviceState"),
        cell: ({ state }) => <StatusIndicator type={getServiceStateType(state)}>{state ?? "-"}</StatusIndicator>,
      },
      {
        id: "active-state",
        header: t("nodeDetail.activeState"),
        cell: (item) => item["active-state"] ?? "-",
      },
      {
        id: "unit-state",
        header: t("nodeDetail.unitState"),
        cell: (item) => item["unit-state"] ?? "-",
      },
      {
        id: "actions",
        header: t("common.actions"),
        cell: ({ service }) => {
          const loadingAction = serviceActionLoading[service];
          return (
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="inline-link" loading={loadingAction === "start"} disabled={!!loadingAction} onClick={() => void runServiceAction(service, "start")}>
                {t("nodeDetail.startService")}
              </Button>
              <Button variant="inline-link" loading={loadingAction === "stop"} disabled={!!loadingAction} onClick={() => void runServiceAction(service, "stop")}>
                {t("nodeDetail.stopService")}
              </Button>
              <Button variant="inline-link" loading={loadingAction === "restart"} disabled={!!loadingAction} onClick={() => void runServiceAction(service, "restart")}>
                {t("nodeDetail.restartService")}
              </Button>
            </SpaceBetween>
          );
        },
      },
    ],
    [runServiceAction, serviceActionLoading, t],
  );

  const syslogEmptyState = (
    <Box textAlign="center" color="text-body-secondary" padding="xxl">
      {t("nodeDetail.noSyslogEntries")}
    </Box>
  );

  const syslogNoMatch = (
    <Box textAlign="center" color="text-body-secondary" padding="xxl">
      {t("common.noMatches")}
    </Box>
  );

  const {
    actions: syslogActions,
    items: filteredSyslogItems,
    collectionProps: syslogCollectionProps,
    filterProps: syslogFilterProps,
    filteredItemsCount: filteredSyslogCount,
    paginationProps: syslogPaginationProps,
  } = useCollection(syslogEntries, {
    filtering: {
      filteringFunction: ({ n, t: message }, filteringText) => {
        const query = filteringText.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return [String(n), message].some((value) => value.toLowerCase().includes(query));
      },
      empty: syslogEmptyState,
      noMatch: syslogNoMatch,
    },
    pagination: {
      pageSize: 50,
    },
  });

  const syslogHeaderCounter = syslogFilterProps.filteringText
    ? `(${filteredSyslogCount ?? syslogEntries.length}/${syslogEntries.length})`
    : `(${syslogEntries.length})`;

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

  const systemItems = [
    {
      label: t("nodeDetail.cpuModel"),
      value: st.cpuinfo?.model ?? "-",
    },
    {
      label: t("nodeDetail.cpuSockets"),
      value: String(st.cpuinfo?.sockets ?? "-"),
    },
    {
      label: t("nodeDetail.cpuCoresLabel"),
      value: String(st.cpuinfo?.cores ?? "-"),
    },
    {
      label: t("nodeDetail.totalCpus"),
      value: String(st.cpuinfo?.cpus ?? "-"),
    },
    {
      label: t("nodeDetail.kernelVersion"),
      value: st.kversion ?? "-",
    },
    {
      label: t("nodeDetail.pveVersion"),
      value: st.pveversion ?? "-",
    },
    {
      label: t("nodeDetail.bootMode"),
      value: getBootMode(st),
    },
  ];

  const dnsItems = [
    {
      label: t("nodeDetail.searchDomain"),
      value: dnsConfig?.search ?? "-",
    },
    {
      label: t("nodeDetail.dnsServer1"),
      value: dnsConfig?.dns1 ?? "-",
    },
    {
      label: t("nodeDetail.dnsServer2"),
      value: dnsConfig?.dns2 ?? "-",
    },
    {
      label: t("nodeDetail.dnsServer3"),
      value: dnsConfig?.dns3 ?? "-",
    },
  ];

  const timeItems = [
    {
      label: t("nodeDetail.timezone"),
      value: timeConfig?.timezone ?? "-",
    },
    {
      label: t("nodeDetail.localTime"),
      value: formatDateTime(timeConfig?.localtime),
    },
    {
      label: t("nodeDetail.utcTime"),
      value: formatDateTime(timeConfig?.time),
    },
  ];

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
      id: "system",
      label: t("nodeDetail.system"),
      content: systemItems.some((item) => item.value !== "-") ? (
        <ColumnLayout columns={1}>
          <KeyValuePairs columns={3} items={systemItems} />
        </ColumnLayout>
      ) : (
        <Box textAlign="center" color="text-body-secondary" padding="xxl">{t("nodeDetail.noSystemInfo")}</Box>
      ),
    },
    {
      id: "dns",
      label: t("nodeDetail.dns"),
      content: (
        <SpaceBetween size="m">
          {dnsError ? (
            <Alert type="error" header={t("nodeDetail.failedToLoadDns")}>{dnsError}</Alert>
          ) : null}
          {dnsLoading ? (
            <Box textAlign="center" padding={{ top: "xxxl" }}><Spinner size="large" /></Box>
          ) : (
            <ColumnLayout columns={1}>
              <KeyValuePairs columns={2} items={dnsItems} />
            </ColumnLayout>
          )}
          <Box>
            <Button onClick={openDnsModal} disabled={dnsLoading}>{t("nodeDetail.editDns")}</Button>
          </Box>
        </SpaceBetween>
      ),
    },
    {
      id: "time",
      label: t("nodeDetail.time"),
      content: (
        <SpaceBetween size="m">
          {timeError ? (
            <Alert type="error" header={t("nodeDetail.failedToLoadTime")}>{timeError}</Alert>
          ) : null}
          {timeLoading ? (
            <Box textAlign="center" padding={{ top: "xxxl" }}><Spinner size="large" /></Box>
          ) : (
            <ColumnLayout columns={1}>
              <KeyValuePairs columns={3} items={timeItems} />
            </ColumnLayout>
          )}
          <Box>
            <Button onClick={openTimeModal} disabled={timeLoading}>{t("nodeDetail.editTime")}</Button>
          </Box>
        </SpaceBetween>
      ),
    },
    {
      id: "syslog",
      label: t("nodeDetail.syslog"),
      content: (
        <SpaceBetween size="m">
          {syslogError ? (
            <Alert type="error" header={t("nodeDetail.failedToLoadSyslog")}>{syslogError}</Alert>
          ) : null}
          <Table<PveNodeSyslogEntry>
            {...syslogCollectionProps}
            items={filteredSyslogItems}
            trackBy={(item) => `${item.n}-${item.t}`}
            variant="full-page"
            loading={syslogLoading}
            loadingText={t("nodeDetail.syslogEntries")}
            columnDefinitions={syslogColumns}
            stickyHeader
            resizableColumns
            enableKeyboardNavigation
            empty={syslogFilterProps.filteringText ? syslogNoMatch : syslogEmptyState}
            header={
              <Header
                variant="h2"
                counter={syslogHeaderCounter}
                actions={<Button iconName="refresh" onClick={() => void loadSyslog()}>{t("common.refresh")}</Button>}
              >
                {t("nodeDetail.syslogEntries")}
              </Header>
            }
            filter={
              <TextFilter
                {...syslogFilterProps}
                filteringPlaceholder={t("nodeDetail.searchSyslog")}
                countText={`${filteredSyslogCount ?? syslogEntries.length} ${t("common.matches")}`}
              />
            }
            pagination={<Pagination {...syslogPaginationProps} />}
          />
        </SpaceBetween>
      ),
    },
    {
      id: "services",
      label: t("nodeDetail.services"),
      content: (
        <SpaceBetween size="m">
          {servicesError ? (
            <Alert type="error" header={t("nodeDetail.failedToLoadServices")}>{servicesError}</Alert>
          ) : null}
          <Table
            variant="borderless"
            stickyHeader
            resizableColumns
            enableKeyboardNavigation
            trackBy="service"
            items={services}
            loading={servicesLoading}
            loadingText={t("nodeDetail.nodeServices")}
            columnDefinitions={servicesColumns}
            empty={<Box textAlign="center" color="text-body-secondary" padding="xxl">{t("nodeDetail.noServices")}</Box>}
            header={
              <Header variant="h2" counter={`(${services.length})`} actions={<Button iconName="refresh" onClick={() => void loadServices()}>{t("common.refresh")}</Button>}>
                {t("nodeDetail.nodeServices")}
              </Header>
            }
          />
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
      {flashbarItems.length > 0 ? <Flashbar items={flashbarItems} /> : null}
      {actionError ? (
        <Alert type="error" header={t("common.error")} dismissible onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <Header
        variant="h1"
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <Button loading={actionLoading === "reboot"} disabled={!!actionLoading} onClick={() => setRebootModalVisible(true)}>
              {t("nodeDetail.reboot")}
            </Button>
            <Button loading={actionLoading === "shutdown"} disabled={!!actionLoading} onClick={() => setShutdownModalVisible(true)}>
              {t("nodeDetail.shutdown")}
            </Button>
            <Button
              iconName="refresh"
              disabled={loading || !!actionLoading}
              onClick={() => {
                void loadNode();
                if (activeTabId === "dns") {
                  void loadDns();
                }
                if (activeTabId === "time") {
                  void loadTime();
                }
                if (activeTabId === "syslog") {
                  syslogActions.setFiltering("");
                  void loadSyslog();
                }
                if (activeTabId === "services") {
                  void loadServices();
                }
              }}
            >
              {t("common.refresh")}
            </Button>
          </SpaceBetween>
        }
      >
        {data.status.node || node}
      </Header>
      <Tabs
        tabs={tabs}
        activeTabId={activeTabId}
        onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
      />
      <Modal
        visible={rebootModalVisible}
        onDismiss={() => setRebootModalVisible(false)}
        header={t("nodeDetail.rebootNode")}
        closeAriaLabel={t("nodeDetail.rebootNode")}
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setRebootModalVisible(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" loading={actionLoading === "reboot"} onClick={() => void runNodeAction("reboot")}>
                {t("common.confirm")}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>{t("nodeDetail.confirmReboot").replace("{node}", node)}</Box>
      </Modal>
      <Modal
        visible={shutdownModalVisible}
        onDismiss={() => setShutdownModalVisible(false)}
        header={t("nodeDetail.shutdownNode")}
        closeAriaLabel={t("nodeDetail.shutdownNode")}
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setShutdownModalVisible(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" loading={actionLoading === "shutdown"} onClick={() => void runNodeAction("shutdown")}>
                {t("common.confirm")}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>{t("nodeDetail.confirmShutdown").replace("{node}", node)}</Box>
      </Modal>
      <Modal
        visible={dnsModalVisible}
        onDismiss={() => {
          setDnsModalVisible(false);
          setDnsError(null);
        }}
        header={t("nodeDetail.editDns")}
        closeAriaLabel={t("nodeDetail.editDns")}
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button
                variant="link"
                onClick={() => {
                  setDnsModalVisible(false);
                  setDnsError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" loading={dnsSaving} onClick={() => void saveDns()}>{t("common.save")}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {dnsError ? (
            <Alert type="error" header={t("nodeDetail.failedToUpdateDns")}>{dnsError}</Alert>
          ) : null}
          <FormField label={t("nodeDetail.searchDomain")}>
            <Input
              value={dnsForm.search ?? ""}
              placeholder={t("nodeDetail.searchDomainPlaceholder")}
              onChange={({ detail }) => setDnsForm((current) => ({ ...current, search: detail.value }))}
            />
          </FormField>
          <FormField label={t("nodeDetail.dnsServer1")}>
            <Input
              value={dnsForm.dns1 ?? ""}
              placeholder={t("nodeDetail.dnsPlaceholder")}
              onChange={({ detail }) => setDnsForm((current) => ({ ...current, dns1: detail.value }))}
            />
          </FormField>
          <FormField label={t("nodeDetail.dnsServer2")}>
            <Input
              value={dnsForm.dns2 ?? ""}
              placeholder={t("nodeDetail.dnsPlaceholder")}
              onChange={({ detail }) => setDnsForm((current) => ({ ...current, dns2: detail.value }))}
            />
          </FormField>
          <FormField label={t("nodeDetail.dnsServer3")}>
            <Input
              value={dnsForm.dns3 ?? ""}
              placeholder={t("nodeDetail.dnsPlaceholder")}
              onChange={({ detail }) => setDnsForm((current) => ({ ...current, dns3: detail.value }))}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
      <Modal
        visible={timeModalVisible}
        onDismiss={() => {
          setTimeModalVisible(false);
          setTimeError(null);
        }}
        header={t("nodeDetail.editTime")}
        closeAriaLabel={t("nodeDetail.editTime")}
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button
                variant="link"
                onClick={() => {
                  setTimeModalVisible(false);
                  setTimeError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" loading={timeSaving} onClick={() => void saveTime()}>{t("common.save")}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {timeError ? (
            <Alert type="error" header={t("nodeDetail.failedToUpdateTime")}>{timeError}</Alert>
          ) : null}
          <FormField label={t("nodeDetail.timezone")}>
            <Input value={timezoneValue} placeholder={t("nodeDetail.timezonePlaceholder")} onChange={({ detail }) => setTimezoneValue(detail.value)} />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
