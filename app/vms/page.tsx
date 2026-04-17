"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/app/components/notifications";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@/app/components/app-link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import Modal from "@cloudscape-design/components/modal";
import Input from "@cloudscape-design/components/input";
import FormField from "@cloudscape-design/components/form-field";
import { useTranslation } from "@/app/lib/use-translation";

interface NodeSummary {
  node: string;
  status: "online" | "offline" | "unknown";
}

interface VmSummary {
  vmid: number;
  name?: string;
  node: string;
  status: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
}

interface Preferences {
  pageSize: number;
  wrapLines: boolean;
  stripedRows: boolean;
  contentDensity: "comfortable" | "compact";
  contentDisplay: ReadonlyArray<CollectionPreferencesProps.ContentDisplayItem>;
}

const DEFAULT_PREFERENCES: Preferences = {
  pageSize: 20,
  wrapLines: false,
  stripedRows: true,
  contentDensity: "comfortable",
  contentDisplay: [
    { id: "vmid", visible: true },
    { id: "name", visible: true },
    { id: "node", visible: true },
    { id: "status", visible: true },
    { id: "cpu", visible: true },
    { id: "memory", visible: true },
    { id: "disk", visible: true },
    { id: "uptime", visible: true },
  ],
};

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

function getVmStatusType(status: string) {
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

function getStatusLabel(t: (key: string) => string, status: string) {
  if (status === "running") return t("common.running");
  if (status === "stopped") return t("common.stopped");
  return status;
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
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

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const json = (await response.json()) as { data?: T };
  return json.data as T;
}

export default function VirtualMachinesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { addError, trackTask } = useNotifications();
  const [vms, setVms] = useState<VmSummary[]>([]);
  const [selectedItems, setSelectedItems] = useState<VmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | "reboot" | "delete" | null>(null);

  const loadVms = useCallback(async () => {
    try {
      setLoading(true);
      const nodes = await fetchProxmox<NodeSummary[]>("/api/proxmox/nodes");
      const onlineNodes = (nodes ?? []).filter((node) => node.status === "online");
      const vmGroups = await Promise.all(
        onlineNodes.map(async ({ node }) => {
          const nodeVms = await fetchProxmox<Omit<VmSummary, "node">[]>(`/api/proxmox/nodes/${node}/qemu`);
          return (nodeVms ?? []).map((vm) => ({ ...vm, node }));
        }),
      );
      const nextVms = vmGroups.flat().sort((a, b) => a.vmid - b.vmid);

      setVms(nextVms);
      setSelectedItems((current) => {
        const vmids = new Set(nextVms.map((vm) => vm.vmid));
        return current.filter((vm) => vmids.has(vm.vmid)).map((vm) => nextVms.find((v) => v.vmid === vm.vmid)!);
      });
      setError(null);
    } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : t("vms.failedToLoadGeneric"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVms();
  }, [loadVms]);

  const hasSelection = selectedItems.length > 0;
  const allStopped = hasSelection && selectedItems.every((vm) => vm.status === "stopped");
  const allRunning = hasSelection && selectedItems.every((vm) => vm.status === "running");
  const canStart = allStopped && !actionLoading;
  const canStop = allRunning && !actionLoading;
  const canReboot = allRunning && !actionLoading;
  const canDelete = allStopped && !actionLoading;
  const canOpenConsole = selectedItems.length === 1 && selectedItems[0]?.status === "running" && !actionLoading;

  const runPowerAction = useCallback(
    async (action: "start" | "stop" | "reboot") => {
      if (selectedItems.length === 0) return;
      const expectedStatus = action === "stop" ? "stopped" : "running";
      const targetVmids = new Set(selectedItems.map((vm) => vm.vmid));
      try {
        setActionLoading(action);

        const results = await Promise.all(
          selectedItems.map(async (vm) => {
            const upid = await fetchProxmox<string>(`/api/proxmox/nodes/${vm.node}/qemu/${vm.vmid}/status/${action}`, {
              method: "POST",
              body: JSON.stringify({}),
            });
            return { vm, upid };
          }),
        );

        for (const { vm, upid } of results) {
          if (upid) {
            trackTask(upid, vm.node, `${action} VM ${vm.vmid} (${vm.name ?? "unnamed"})`);
          }
        }

        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const nodes = await fetchProxmox<NodeSummary[]>("/api/proxmox/nodes");
          const onlineNodes = (nodes ?? []).filter((n) => n.status === "online");
          const vmGroups = await Promise.all(
            onlineNodes.map(async ({ node }) => {
              const nodeVms = await fetchProxmox<Omit<VmSummary, "node">[]>(`/api/proxmox/nodes/${node}/qemu`);
              return (nodeVms ?? []).map((vm) => ({ ...vm, node }));
            }),
          );
          const freshVms = vmGroups.flat().sort((a, b) => a.vmid - b.vmid);
          const allTransitioned = freshVms
            .filter((vm) => targetVmids.has(vm.vmid))
            .every((vm) => action === "reboot" ? vm.status === "running" : vm.status === expectedStatus);

          setVms(freshVms);
          setSelectedItems((current) => {
            const vmids = new Set(freshVms.map((vm) => vm.vmid));
            return current.filter((vm) => vmids.has(vm.vmid)).map((vm) => freshVms.find((v) => v.vmid === vm.vmid)!);
          });

          if (allTransitioned) break;
        }
      } catch (actionError) {
          addError(actionError instanceof Error ? actionError.message : interpolate(t("vms.failedAction"), { action }));
      } finally {
        setActionLoading(null);
      }
    },
    [selectedItems, trackTask, addError],
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const deleteConfirmPhrase = selectedItems.length === 1
    ? (selectedItems[0].name ?? String(selectedItems[0].vmid))
    : "delete";

  const handleOpenDelete = () => {
    setDeleteConfirmText("");
    setShowDeleteConfirm(true);
  };

  const handleCloseDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteConfirmText("");
  };

  const runDelete = useCallback(async () => {
    if (selectedItems.length === 0) return;
    try {
      setActionLoading("delete");
      const results = await Promise.all(
        selectedItems.map(async (vm) => {
          const upid = await fetchProxmox<string>(`/api/proxmox/nodes/${vm.node}/qemu/${vm.vmid}`, {
            method: "DELETE",
          });
          return { vm, upid };
        }),
      );

      for (const { vm, upid } of results) {
        if (upid) {
          trackTask(upid, vm.node, `Delete VM ${vm.vmid} (${vm.name ?? "unnamed"})`);
        }
      }

      setSelectedItems([]);
      setShowDeleteConfirm(false);
      await loadVms();
    } catch (deleteError) {
      addError(deleteError instanceof Error ? deleteError.message : t("vms.failedToDelete"));
    } finally {
      setActionLoading(null);
    }
  }, [loadVms, selectedItems, trackTask, addError]);

  const columnDefinitions = useMemo<TableProps<VmSummary>["columnDefinitions"]>(
    () => [
      {
        id: "vmid",
        header: t("vms.vmid"),
        cell: ({ vmid }) => <Link href={`/vms/${vmid}`}>{vmid}</Link>,
        sortingField: "vmid",
        isRowHeader: true,
        minWidth: 120,
      },
      {
        id: "name",
        header: t("common.name"),
        cell: ({ name }) => name ?? "-",
        sortingField: "name",
        minWidth: 180,
      },
      {
        id: "node",
        header: t("vms.node"),
        cell: ({ node }) => node,
        sortingField: "node",
        minWidth: 160,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: ({ status }) => <StatusIndicator type={getVmStatusType(status)}>{getStatusLabel(t, status)}</StatusIndicator>,
        sortingField: "status",
        minWidth: 140,
      },
      {
        id: "cpu",
        header: t("common.cpuPercent"),
        cell: ({ cpu }) => `${((cpu ?? 0) * 100).toFixed(1)}%`,
        sortingComparator: (a, b) => (a.cpu ?? 0) - (b.cpu ?? 0),
        minWidth: 120,
      },
      {
        id: "memory",
        header: t("vms.memory"),
        cell: ({ mem, maxmem }) => `${formatBytes(mem ?? 0)} / ${formatBytes(maxmem ?? 0)}`,
        sortingComparator: (a, b) => (a.mem ?? 0) - (b.mem ?? 0),
        minWidth: 220,
      },
      {
        id: "disk",
        header: t("common.disk"),
        cell: ({ disk, maxdisk }) => `${formatBytes(disk ?? 0)} / ${formatBytes(maxdisk ?? 0)}`,
        sortingComparator: (a, b) => (a.disk ?? 0) - (b.disk ?? 0),
        minWidth: 220,
      },
      {
        id: "uptime",
        header: t("vms.uptime"),
        cell: ({ uptime }) => formatUptime(uptime ?? 0),
        sortingComparator: (a, b) => (a.uptime ?? 0) - (b.uptime ?? 0),
        minWidth: 140,
      },
    ],
    [t],
  );

  const emptyState = (
    <Box textAlign="center" margin={{ vertical: "xs" }}>
      <SpaceBetween size="xxl">
        <div>
          <Box variant="strong">{t("vms.noInstances")}</Box>
          <Box color="text-body-secondary" margin={{ top: "xs" }}>
            {t("vms.noVirtualMachinesAvailable")}
          </Box>
        </div>
        <Button variant="primary" onClick={() => router.push("/vms/create")}>{t("vms.launchInstance")}</Button>
      </SpaceBetween>
    </Box>
  );

  const noMatchState = (
    <Box textAlign="center" margin={{ vertical: "xs" }}>
      <SpaceBetween size="xxl">
        <div>
          <Box variant="strong">{t("common.noMatches")}</Box>
          <Box color="text-body-secondary" margin={{ top: "xs" }}>
            {t("vms.noVirtualMachinesMatch")}
          </Box>
        </div>
        <Button onClick={() => actions.setFiltering("")}>{t("common.clearFilter")}</Button>
      </SpaceBetween>
    </Box>
  );

  const { actions, items, collectionProps, filterProps, filteredItemsCount, paginationProps } = useCollection(vms, {
    filtering: {
      filteringFunction: (item, filteringText) => {
        const query = filteringText.trim().toLowerCase();
        if (!query) {
          return true;
        }
        return [
          String(item.vmid),
          item.name ?? "",
          item.node,
          item.status,
          `${((item.cpu ?? 0) * 100).toFixed(1)}%`,
          `${formatBytes(item.mem ?? 0)} / ${formatBytes(item.maxmem ?? 0)}`,
          `${formatBytes(item.disk ?? 0)} / ${formatBytes(item.maxdisk ?? 0)}`,
          formatUptime(item.uptime ?? 0),
        ].some((value) => value.toLowerCase().includes(query));
      },
      empty: emptyState,
      noMatch: noMatchState,
    },
    sorting: {
      defaultState: {
        sortingColumn: columnDefinitions[0],
      },
    },
    pagination: {
      pageSize: preferences.pageSize,
    },
    selection: {},
  });

  const headerCounter = filteredItemsCount === undefined ? `(${vms.length})` : `(${filteredItemsCount}/${vms.length})`;

  return (
    <SpaceBetween size="m">
      <Modal
        visible={showDeleteConfirm}
        onDismiss={handleCloseDelete}
        header={interpolate(t("vms.deleteInstancesHeader"), { count: selectedItems.length, suffix: selectedItems.length > 1 ? "s" : "" })}
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={handleCloseDelete}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                loading={actionLoading === "delete"}
                disabled={deleteConfirmText !== deleteConfirmPhrase}
                onClick={() => void runDelete()}
              >
                {t("common.delete")}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Alert type="warning">
            {interpolate(t("vms.deleteWarning"), { suffix: selectedItems.length > 1 ? "s" : "" })}
          </Alert>
          <Box>
            {selectedItems.map((vm) => (
              <Box key={vm.vmid} variant="code" display="block" padding={{ vertical: "xxs" }}>
                {vm.vmid} — {vm.name ?? t("vms.unnamed")}
              </Box>
            ))}
          </Box>
          <FormField
            label={interpolate(t("vms.confirmDeletion"), { value: deleteConfirmPhrase })}
          >
            <Input
              value={deleteConfirmText}
              onChange={({ detail }) => setDeleteConfirmText(detail.value)}
              placeholder={deleteConfirmPhrase}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
      {error ? (
        <Alert type="error" header={t("vms.failedToLoad")}>
          {error}
        </Alert>
      ) : null}
      <Table
        {...collectionProps}
        items={items}
        selectedItems={selectedItems}
        onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
        selectionType="multi"
        trackBy="vmid"
        columnDefinitions={columnDefinitions}
        variant="full-page"
        stickyHeader
        stickyColumns={{ first: 1 }}
        resizableColumns
        enableKeyboardNavigation
        loading={loading}
        loadingText={t("vms.loading")}
        empty={filterProps.filteringText ? noMatchState : emptyState}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        contentDensity={preferences.contentDensity}
        columnDisplay={preferences.contentDisplay}
        header={
          <Header
            variant="h1"
            description={t("vms.manageDescription")}
            counter={headerCounter}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button variant="primary" disabled={!!actionLoading} onClick={() => router.push("/vms/create")}>
                  {t("vms.launchInstance")}
                </Button>
                <Button disabled={!canOpenConsole} onClick={() => router.push(`/vms/${selectedItems[0]?.vmid}/console`)}>
                  {t("vms.console")}
                </Button>
                <Button loading={actionLoading === "start"} disabled={!canStart} onClick={() => void runPowerAction("start")}>
                  {t("vms.start")}
                </Button>
                <Button loading={actionLoading === "stop"} disabled={!canStop} onClick={() => void runPowerAction("stop")}>
                  {t("vms.stop")}
                </Button>
                <Button loading={actionLoading === "reboot"} disabled={!canReboot} onClick={() => void runPowerAction("reboot")}>
                  {t("vms.reboot")}
                </Button>
                <Button loading={actionLoading === "delete"} disabled={!canDelete} onClick={handleOpenDelete}>
                  {t("vms.delete")}
                </Button>
                <Button iconName="refresh" ariaLabel={t("common.refresh")} disabled={!!actionLoading} onClick={() => void loadVms()} />
              </SpaceBetween>
            }
          >
            {t("vms.virtualMachines")}
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder={t("vms.findPlaceholder")}
            countText={`${filteredItemsCount ?? vms.length} ${t("common.matches")}`}
          />
        }
        pagination={<Pagination {...paginationProps} />}
        preferences={
          <CollectionPreferences
            title={t("common.preferences")}
            confirmLabel={t("common.confirm")}
            cancelLabel={t("common.cancel")}
            preferences={preferences}
            onConfirm={({ detail }) =>
              setPreferences((current) => ({
                pageSize: detail.pageSize ?? current.pageSize,
                wrapLines: detail.wrapLines ?? current.wrapLines,
                stripedRows: detail.stripedRows ?? current.stripedRows,
                contentDensity: detail.contentDensity ?? current.contentDensity,
                contentDisplay: detail.contentDisplay ?? current.contentDisplay,
              }))
            }
            pageSizePreference={{
              title: t("common.pageSize"),
              options: [
                { value: 10, label: `10 ${t("vms.instancesLabel")}` },
                { value: 20, label: `20 ${t("vms.instancesLabel")}` },
                { value: 50, label: `50 ${t("vms.instancesLabel")}` },
              ],
            }}
            wrapLinesPreference={{
              label: t("common.wrapLines"),
              description: t("settings.tableDensityDescription"),
            }}
            stripedRowsPreference={{
              label: t("common.stripedRows"),
              description: t("common.stripedRows"),
            }}
            contentDensityPreference={{
              label: t("common.contentDensity"),
              description: t("settings.tableDensityDescription"),
            }}
            contentDisplayPreference={{
              title: t("common.columnPreferences"),
              options: [
                { id: "vmid", label: t("vms.vmid") },
                { id: "name", label: t("common.name") },
                { id: "node", label: t("vms.node") },
                { id: "status", label: t("common.status") },
                { id: "cpu", label: t("common.cpuPercent") },
                { id: "memory", label: t("vms.memory") },
                { id: "disk", label: t("common.disk") },
                { id: "uptime", label: t("vms.uptime") },
              ],
            }}
          />
        }
      />
    </SpaceBetween>
  );
}
