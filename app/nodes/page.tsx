"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
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
import { useTranslation } from "@/app/lib/use-translation";

interface PveNode {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
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
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h`;
}

function getStatusType(status: PveNode["status"]) {
  return status === "online" ? "success" : "error";
}

async function fetchProxmox<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const json = (await response.json()) as { data?: T };
  return json.data as T;
}

export default function NodesPage() {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<PveNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  const loadNodes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchProxmox<PveNode[]>("/api/proxmox/nodes");
      setNodes(data ?? []);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : t("nodes.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const columnDefinitions = useMemo<TableProps<PveNode>["columnDefinitions"]>(
    () => [
      {
        id: "node",
        header: t("common.name"),
        cell: ({ node }) => <Link href={`/nodes/${node}`}>{node}</Link>,
        sortingField: "node",
        isRowHeader: true,
        minWidth: 180,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: ({ status }) => <StatusIndicator type={getStatusType(status)}>{status === "online" ? t("common.online") : t("common.offline")}</StatusIndicator>,
        sortingField: "status",
        minWidth: 140,
      },
      {
        id: "cpu",
        header: t("common.cpuPercent"),
        cell: ({ cpu }) => `${(cpu * 100).toFixed(1)}%`,
        sortingComparator: (a, b) => a.cpu - b.cpu,
        minWidth: 120,
      },
      {
        id: "memory",
        header: t("common.memory"),
        cell: ({ mem, maxmem }) => `${formatBytes(mem)} / ${formatBytes(maxmem)}`,
        sortingComparator: (a, b) => a.mem - b.mem,
        minWidth: 220,
      },
      {
        id: "disk",
        header: t("common.disk"),
        cell: ({ disk, maxdisk }) => `${formatBytes(disk)} / ${formatBytes(maxdisk)}`,
        sortingComparator: (a, b) => a.disk - b.disk,
        minWidth: 220,
      },
      {
        id: "uptime",
        header: t("common.uptime"),
        cell: ({ uptime }) => formatUptime(uptime),
        sortingComparator: (a, b) => a.uptime - b.uptime,
        minWidth: 140,
      },
    ],
    [t],
  );

  const emptyState = (
    <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
      <SpaceBetween size="m">
        <b>{t("nodes.noNodes")}</b>
        <Box variant="p" color="inherit">
          {t("nodes.noNodesAvailable")}
        </Box>
        <Button onClick={() => void loadNodes()}>{t("common.refresh")}</Button>
      </SpaceBetween>
    </Box>
  );

  const {
    actions,
    items,
    collectionProps,
    filterProps,
    filteredItemsCount,
    paginationProps,
  } = useCollection(nodes, {
    filtering: {
      filteringFunction: (item, filteringText) => {
        const query = filteringText.trim().toLowerCase();
        if (!query) {
          return true;
        }
        return [
          item.node,
          item.status,
          `${(item.cpu * 100).toFixed(1)}%`,
          `${formatBytes(item.mem)} / ${formatBytes(item.maxmem)}`,
          `${formatBytes(item.disk)} / ${formatBytes(item.maxdisk)}`,
          formatUptime(item.uptime),
        ].some((value) => value.toLowerCase().includes(query));
      },
      empty: emptyState,
      noMatch: (
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <SpaceBetween size="m">
            <b>{t("common.noMatches")}</b>
            <Box variant="p" color="inherit">
              {t("nodes.noNodesMatch")}
            </Box>
            <Button onClick={() => actions.setFiltering("")}>{t("common.clearFilter")}</Button>
          </SpaceBetween>
        </Box>
      ),
    },
    sorting: {
      defaultState: {
        sortingColumn: columnDefinitions[0],
      },
    },
    pagination: {
      pageSize: preferences.pageSize,
    },
  });

  const noMatch = (
    <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
      <SpaceBetween size="m">
        <b>{t("common.noMatches")}</b>
        <Box variant="p" color="inherit">
          {t("nodes.noNodesMatch")}
        </Box>
        <Button onClick={() => actions.setFiltering("")}>{t("common.clearFilter")}</Button>
      </SpaceBetween>
    </Box>
  );

  const headerCounter = filterProps.filteringText ? `(${filteredItemsCount}/${nodes.length})` : `(${nodes.length})`;

  return (
    <SpaceBetween size="m">
      {error ? (
        <Alert type="error" header={t("nodes.failedToLoad")}>
          {error}
        </Alert>
      ) : null}
      <Table
        {...collectionProps}
        items={items}
        columnDefinitions={columnDefinitions}
        variant="full-page"
        stickyHeader
        stickyColumns={{ first: 1 }}
        resizableColumns
        enableKeyboardNavigation
        trackBy="node"
        loading={loading}
        loadingText={t("nodes.loading")}
        empty={filterProps.filteringText ? noMatch : emptyState}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        contentDensity={preferences.contentDensity}
        columnDisplay={preferences.contentDisplay}
        header={
          <Header
            variant="h1"
            counter={headerCounter}
            description={t("nodes.manageDescription")}
            actions={<Button iconName="refresh" onClick={() => void loadNodes()}>{t("common.refresh")}</Button>}
          >
            {t("nodes.nodes")}
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder={t("nodes.findPlaceholder")}
            countText={`${filteredItemsCount ?? nodes.length} ${t("common.matches")}`}
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
                 { value: 10, label: `10 ${t("nodes.nodesLabel")}` },
                 { value: 20, label: `20 ${t("nodes.nodesLabel")}` },
                 { value: 50, label: `50 ${t("nodes.nodesLabel")}` },
               ],
             }}
            wrapLinesPreference={{
              label: t("common.wrapLines"),
              description: t("common.wrapLines"),
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
                { id: "node", label: t("common.name"), alwaysVisible: true },
                { id: "status", label: t("common.status") },
                { id: "cpu", label: t("common.cpuPercent") },
                { id: "memory", label: t("common.memory") },
                { id: "disk", label: t("common.disk") },
                { id: "uptime", label: t("common.uptime") },
              ],
            }}
          />
        }
      />
    </SpaceBetween>
  );
}
