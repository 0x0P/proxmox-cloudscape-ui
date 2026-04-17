"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useTranslation } from "@/app/lib/use-translation";

interface PveNode {
  node: string;
  status: "online" | "offline" | "unknown";
}

interface PveStorage {
  storage: string;
  node: string;
  type: string;
  content: string;
  active?: number;
  status?: string;
  total?: number;
  used?: number;
  avail?: number;
  used_fraction?: number;
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
    { id: "storage", visible: true },
    { id: "node", visible: true },
    { id: "type", visible: true },
    { id: "content", visible: true },
    { id: "status", visible: true },
    { id: "total", visible: true },
    { id: "used", visible: true },
    { id: "avail", visible: true },
    { id: "usage", visible: true },
  ],
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUsage(value?: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 1000) / 10));
}

function isStorageActive(storage: Pick<PveStorage, "active" | "status">) {
  return storage.active === 1 || storage.status === "active";
}

async function fetchProxmox<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const json = (await response.json()) as { data?: T };
  return json.data as T;
}

export default function StoragePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [storages, setStorages] = useState<PveStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  const loadStorages = useCallback(async () => {
    try {
      setLoading(true);
      const nodes = await fetchProxmox<PveNode[]>("/api/proxmox/nodes");
      const onlineNodes = (nodes ?? []).filter((node) => node.status === "online");
      const storageLists = await Promise.all(
        onlineNodes.map(async ({ node }) => {
          const entries = await fetchProxmox<Omit<PveStorage, "node">[]>(`/api/proxmox/nodes/${node}/storage`);
          return (entries ?? []).map((entry) => ({ ...entry, node }));
        }),
      );
      setStorages(storageLists.flat());
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : t("storage.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  const columnDefinitions = useMemo<TableProps<PveStorage>["columnDefinitions"]>(
    () => [
      {
        id: "storage",
        header: t("common.name"),
        cell: ({ storage }) => storage,
        sortingField: "storage",
        isRowHeader: true,
        minWidth: 180,
      },
      {
        id: "node",
        header: t("storage.node"),
        cell: ({ node }) => node,
        sortingField: "node",
        minWidth: 140,
      },
      {
        id: "type",
        header: t("storage.type"),
        cell: ({ type }) => type,
        sortingField: "type",
        minWidth: 140,
      },
      {
        id: "content",
        header: t("storage.content"),
        cell: ({ content }) => content,
        minWidth: 180,
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (storage) => <StatusIndicator type={isStorageActive(storage) ? "success" : "stopped"}>{storage.status ?? (isStorageActive(storage) ? t("nodeDetail.active") : t("nodeDetail.inactive"))}</StatusIndicator>,
        minWidth: 140,
      },
      {
        id: "total",
        header: t("storage.total"),
        cell: ({ total }) => formatBytes(total ?? 0),
        sortingComparator: (a, b) => (a.total ?? 0) - (b.total ?? 0),
        minWidth: 140,
      },
      {
        id: "used",
        header: t("storage.used"),
        cell: ({ used }) => formatBytes(used ?? 0),
        sortingComparator: (a, b) => (a.used ?? 0) - (b.used ?? 0),
        minWidth: 140,
      },
      {
        id: "avail",
        header: t("storage.available"),
        cell: ({ avail }) => formatBytes(avail ?? 0),
        sortingComparator: (a, b) => (a.avail ?? 0) - (b.avail ?? 0),
        minWidth: 140,
      },
      {
        id: "usage",
        header: t("common.usage"),
        cell: ({ used, total, used_fraction }) => (
          <ProgressBar
            value={formatUsage(used_fraction)}
            additionalInfo={`${formatBytes(used ?? 0)} / ${formatBytes(total ?? 0)}`}
          />
        ),
        sortingComparator: (a, b) => (a.used_fraction ?? 0) - (b.used_fraction ?? 0),
        minWidth: 260,
      },
    ],
    [],
  );

  const emptyState = (
    <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
      <SpaceBetween size="m">
        <b>{t("storage.noStorage")}</b>
        <Box variant="p" color="inherit">
          {t("storage.noStorageAvailable")}
        </Box>
        <Button onClick={() => void loadStorages()}>{t("common.refresh")}</Button>
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
  } = useCollection(storages, {
    filtering: {
      filteringFunction: (item, filteringText) => {
        const query = filteringText.trim().toLowerCase();
        if (!query) {
          return true;
        }
        return [
          item.storage,
          item.node,
          item.type,
          item.content,
          item.status ?? "",
          formatBytes(item.total ?? 0),
          formatBytes(item.used ?? 0),
          formatBytes(item.avail ?? 0),
          `${formatUsage(item.used_fraction)}%`,
        ].some((value) => value.toLowerCase().includes(query));
      },
      empty: emptyState,
      noMatch: (
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <SpaceBetween size="m">
            <b>{t("common.noMatches")}</b>
            <Box variant="p" color="inherit">
              {t("storage.noStorageMatch")}
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
          {t("storage.noStorageMatch")}
        </Box>
        <Button onClick={() => actions.setFiltering("")}>{t("common.clearFilter")}</Button>
      </SpaceBetween>
    </Box>
  );

  const headerCounter = filterProps.filteringText ? `(${filteredItemsCount}/${storages.length})` : `(${storages.length})`;

  return (
    <SpaceBetween size="m">
      {error ? (
        <Alert type="error" header={t("storage.failedToLoad")}>
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
        trackBy={(item) => `${item.node}:${item.storage}`}
        loading={loading}
        loadingText={t("storage.loadingStorage")}
        empty={filterProps.filteringText ? noMatch : emptyState}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        contentDensity={preferences.contentDensity}
        columnDisplay={preferences.contentDisplay}
        header={
          <Header
            variant="h1"
            counter={headerCounter}
            description={t("storage.manageDescriptionLong")}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="primary" onClick={() => router.push("/storage/upload")}>{t("storage.upload")}</Button>
                <Button iconName="refresh" onClick={() => void loadStorages()}>{t("common.refresh")}</Button>
              </SpaceBetween>
            }
          >
            {t("storage.storage")}
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder={t("storage.findStorage")}
            countText={`${filteredItemsCount ?? storages.length} ${t("common.matches")}`}
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
                { value: 10, label: t("storage.resourcesCount10") },
                { value: 20, label: t("storage.resourcesCount20") },
                { value: 50, label: t("storage.resourcesCount50") },
              ],
            }}
            wrapLinesPreference={{
              label: t("common.wrapLines"),
              description: t("storage.wrapLinesDesc"),
            }}
            stripedRowsPreference={{
              label: t("common.stripedRows"),
              description: t("storage.stripedRowsDesc"),
            }}
            contentDensityPreference={{
              label: t("common.contentDensity"),
              description: t("storage.contentDensityDesc"),
            }}
            contentDisplayPreference={{
              title: t("common.columnPreferences"),
              options: [
                { id: "storage", label: t("common.name"), alwaysVisible: true },
                { id: "node", label: t("storage.node") },
                { id: "type", label: t("storage.type") },
                { id: "content", label: t("storage.content") },
                { id: "status", label: t("common.status") },
                { id: "total", label: t("storage.total") },
                { id: "used", label: t("storage.used") },
                { id: "avail", label: t("storage.available") },
                { id: "usage", label: t("common.usage") },
              ],
            }}
          />
        }
      />
    </SpaceBetween>
  );
}
