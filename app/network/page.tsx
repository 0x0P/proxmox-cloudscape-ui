"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCollection } from "@cloudscape-design/collection-hooks";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useTranslation } from "@/app/lib/use-translation";

interface PveNode {
  node: string;
  status: "online" | "offline" | "unknown";
}

interface PveNetwork {
  iface: string;
  node: string;
  type: string;
  active?: number;
  address?: string;
  netmask?: string;
  cidr?: string;
  gateway?: string;
  bridge_ports?: string;
  autostart?: number;
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
    { id: "iface", visible: true },
    { id: "node", visible: true },
    { id: "type", visible: true },
    { id: "active", visible: true },
    { id: "address", visible: true },
    { id: "netmask", visible: true },
    { id: "gateway", visible: true },
    { id: "bridge_ports", visible: true },
    { id: "autostart", visible: true },
  ],
};

function formatActive(active?: number) {
  return active === 1;
}

async function fetchProxmox<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const json = (await response.json()) as { data?: T };
  return json.data as T;
}

export default function NetworkPage() {
  const { t } = useTranslation();
  const [interfaces, setInterfaces] = useState<PveNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  const loadInterfaces = useCallback(async () => {
    try {
      setLoading(true);
      const nodes = await fetchProxmox<PveNode[]>("/api/proxmox/nodes");
      const onlineNodes = (nodes ?? []).filter((node) => node.status === "online");
      const networkLists = await Promise.all(
        onlineNodes.map(async ({ node }) => {
          const entries = await fetchProxmox<Omit<PveNetwork, "node">[]>(`/api/proxmox/nodes/${node}/network`);
          return (entries ?? []).map((entry) => ({ ...entry, node }));
        }),
      );
      setInterfaces(networkLists.flat());
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : t("network.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadInterfaces();
  }, [loadInterfaces]);

  const columnDefinitions = useMemo<TableProps<PveNetwork>["columnDefinitions"]>(
    () => [
      {
        id: "iface",
        header: t("network.interfaceName"),
        cell: ({ iface }) => iface,
        sortingField: "iface",
        isRowHeader: true,
        minWidth: 180,
      },
      {
        id: "node",
        header: t("network.node"),
        cell: ({ node }) => node,
        sortingField: "node",
        minWidth: 140,
      },
      {
        id: "type",
        header: t("network.type"),
        cell: ({ type }) => type,
        sortingField: "type",
        minWidth: 140,
      },
      {
        id: "active",
        header: t("network.active"),
        cell: ({ active }) => (
          <StatusIndicator type={formatActive(active) ? "success" : "stopped"}>
            {formatActive(active) ? t("network.active") : t("network.inactive")}
          </StatusIndicator>
        ),
        sortingComparator: (a, b) => (a.active ?? 0) - (b.active ?? 0),
        minWidth: 140,
      },
      {
        id: "address",
        header: t("network.address"),
        cell: ({ address }) => address ?? "-",
        minWidth: 180,
      },
      {
        id: "netmask",
        header: t("network.netmaskCidr"),
        cell: ({ netmask, cidr }) => netmask ?? cidr ?? "-",
        minWidth: 160,
      },
      {
        id: "gateway",
        header: t("network.gateway"),
        cell: ({ gateway }) => gateway ?? "-",
        minWidth: 180,
      },
      {
        id: "bridge_ports",
        header: t("network.bridgePorts"),
        cell: ({ bridge_ports }) => bridge_ports ?? "-",
        minWidth: 180,
      },
      {
        id: "autostart",
        header: t("network.autostart"),
        cell: ({ autostart }) => (autostart === 1 ? t("network.yes") : t("network.no")),
        sortingComparator: (a, b) => (a.autostart ?? 0) - (b.autostart ?? 0),
        minWidth: 140,
      },
    ],
    [t],
  );

  const emptyState = (
    <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
      <SpaceBetween size="m">
        <b>{t("network.noInterfaces")}</b>
        <Box variant="p" color="inherit">
          {t("network.noInterfacesAvailable")}
        </Box>
        <Button onClick={() => void loadInterfaces()}>{t("common.refresh")}</Button>
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
  } = useCollection(interfaces, {
    filtering: {
      filteringFunction: (item, filteringText) => {
        const query = filteringText.trim().toLowerCase();
        if (!query) {
          return true;
        }
        return [
          item.iface,
          item.node,
          item.type,
          formatActive(item.active) ? "active" : "inactive",
          item.address ?? "",
          item.netmask ?? item.cidr ?? "",
          item.gateway ?? "",
          item.bridge_ports ?? "",
          item.autostart === 1 ? "yes" : "no",
        ].some((value) => value.toLowerCase().includes(query));
      },
      empty: emptyState,
      noMatch: (
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <SpaceBetween size="m">
            <b>{t("common.noMatches")}</b>
            <Box variant="p" color="inherit">
              {t("network.noInterfacesMatch")}
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
          {t("network.noInterfacesMatch")}
        </Box>
        <Button onClick={() => actions.setFiltering("")}>{t("common.clearFilter")}</Button>
      </SpaceBetween>
    </Box>
  );

  const headerCounter = filterProps.filteringText ? `(${filteredItemsCount}/${interfaces.length})` : `(${interfaces.length})`;

  return (
    <SpaceBetween size="m">
      {error ? (
        <Alert type="error" header={t("network.failedToLoad") }>
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
        trackBy={(item) => `${item.node}:${item.iface}`}
        loading={loading}
        loadingText={t("network.loadingInterfaces")}
        empty={filterProps.filteringText ? noMatch : emptyState}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        contentDensity={preferences.contentDensity}
        columnDisplay={preferences.contentDisplay}
        header={
          <Header
            variant="h1"
            counter={headerCounter}
            description={t("network.manageDescription")}
            actions={<Button iconName="refresh" onClick={() => void loadInterfaces()}>{t("common.refresh")}</Button>}
          >
            {t("network.interfaces")}
          </Header>
        }
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder={t("network.findInterfaces")}
            countText={`${filteredItemsCount ?? interfaces.length} ${t("common.matches")}`}
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
                { value: 10, label: t("network.interfacesCount10") },
                { value: 20, label: t("network.interfacesCount20") },
                { value: 50, label: t("network.interfacesCount50") },
              ],
            }}
            wrapLinesPreference={{
              label: t("common.wrapLines"),
              description: t("network.wrapLinesDesc"),
            }}
            stripedRowsPreference={{
              label: t("common.stripedRows"),
              description: t("network.stripedRowsDesc"),
            }}
            contentDensityPreference={{
              label: t("common.contentDensity"),
              description: t("network.contentDensityDesc"),
            }}
            contentDisplayPreference={{
              title: t("common.columnPreferences"),
              options: [
                { id: "iface", label: t("network.interfaceName"), alwaysVisible: true },
                { id: "node", label: t("network.node") },
                { id: "type", label: t("network.type") },
                { id: "active", label: t("network.active") },
                { id: "address", label: t("network.address") },
                { id: "netmask", label: t("network.netmaskCidr") },
                { id: "gateway", label: t("network.gateway") },
                { id: "bridge_ports", label: t("network.bridgePorts") },
                { id: "autostart", label: t("network.autostart") },
              ],
            }}
          />
        }
      />
    </SpaceBetween>
  );
}
