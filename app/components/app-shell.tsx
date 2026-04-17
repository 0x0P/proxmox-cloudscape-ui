"use client";

import { type ReactNode, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import AppLayoutToolbar from "@cloudscape-design/components/app-layout-toolbar";
import SideNavigation, { type SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import BreadcrumbGroup, { type BreadcrumbGroupProps } from "@cloudscape-design/components/breadcrumb-group";
import Flashbar from "@cloudscape-design/components/flashbar";
import { I18nProvider } from "@cloudscape-design/components/i18n";
import enMessages from "@cloudscape-design/components/i18n/messages/all.en.json";
import { AuthProvider, useAuth } from "./auth-context";
import { NotificationProvider, useNotifications } from "./notifications";
import { SettingsProvider } from "./settings-context";
import { useTranslation } from "@/app/lib/use-translation";

import "@cloudscape-design/global-styles/dark-mode-utils.css";

function useBreadcrumbs(t: (key: string) => string) {
  const pathname = usePathname();
  const breadcrumbMap: Record<string, string> = {
    "/": t("nav.dashboard"),
    "/vms": t("nav.virtualMachines"),
    "/containers": t("nav.containers"),
    "/nodes": t("nav.nodes"),
    "/storage": t("nav.storage"),
    "/storage/upload": t("nav.uploadIsoTemplate"),
    "/network": t("nav.network"),
    "/logs": t("nav.logs"),
    "/settings": t("nav.settings"),
  };
  const items = [{ text: "Proxmox VE", href: "/" }];

  if (pathname !== "/") {
    const segments = pathname.split("/").filter(Boolean);
    let href = "";
    for (const segment of segments) {
      href += `/${segment}`;
      items.push({
        text: breadcrumbMap[href] ?? segment,
        href,
      });
    }
  }

  return items;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <I18nProvider locale="en" messages={[enMessages]}>
      <AuthProvider>
        <SettingsProvider>
          <NotificationProvider>
            {pathname === "/login" ? children : <AppShellInner>{children}</AppShellInner>}
          </NotificationProvider>
        </SettingsProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const breadcrumbs = useBreadcrumbs(t);
  const [navOpen, setNavOpen] = useState(true);
  const { notifications } = useNotifications();
  const { authenticated, loading, logout, user } = useAuth();

  const navHeader: SideNavigationProps["header"] = {
    text: "Proxmox VE",
    href: "/",
  };

  const navItems: SideNavigationProps["items"] = [
    { type: "link", text: t("nav.dashboard"), href: "/" },
    { type: "divider" },
    {
      type: "section",
      text: t("nav.compute"),
      defaultExpanded: true,
      items: [
        { type: "link", text: t("nav.virtualMachines"), href: "/vms" },
        { type: "link", text: t("nav.containers"), href: "/containers" },
      ],
    },
    {
      type: "section",
      text: t("nav.infrastructure"),
      defaultExpanded: true,
      items: [
        { type: "link", text: t("nav.nodes"), href: "/nodes" },
        { type: "link", text: t("nav.storage"), href: "/storage" },
        { type: "link", text: t("nav.uploadIsoTemplate"), href: "/storage/upload" },
        { type: "link", text: t("nav.network"), href: "/network" },
      ],
    },
    {
      type: "section",
      text: t("nav.cluster"),
      defaultExpanded: false,
      items: [
        { type: "link", text: t("nav.options"), href: "/cluster/options" },
        { type: "link", text: t("nav.replication"), href: "/cluster/replication" },
        { type: "link", text: t("nav.highAvailability"), href: "/cluster/ha" },
      ],
    },
    {
      type: "section",
      text: t("nav.system"),
      defaultExpanded: true,
      items: [
        { type: "link", text: t("nav.logs"), href: "/logs" },
        { type: "link", text: t("nav.settings"), href: "/settings" },
      ],
    },
    { type: "divider" },
    {
      type: "link",
      text: t("nav.proxmoxDocumentation"),
      href: "https://pve.proxmox.com/pve-docs/",
      external: true,
      externalIconAriaLabel: t("common.opensInNewTab"),
    },
  ];

  const onNavFollow: SideNavigationProps["onFollow"] = (e) => {
    if (e.detail.external) return;
    e.preventDefault();
    router.push(e.detail.href);
  };

  const onBreadcrumbFollow: BreadcrumbGroupProps["onFollow"] = (e) => {
    e.preventDefault();
    router.push(e.detail.href);
  };

  if (loading) {
    return (
      <Box textAlign="center" padding="xxxl">
        <Spinner size="large" />
      </Box>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <>
      <TopNavigation
        identity={{
          href: "/",
          title: "Proxmox VE",
          onFollow: (e) => {
            e.preventDefault();
            router.push("/");
          },
        }}
        utilities={[
          {
            type: "menu-dropdown",
            iconName: "notification",
            ariaLabel: t("nav.notifications"),
            badge: notifications.length > 0,
            title: `${t("nav.notifications")} (${notifications.length})`,
            items: notifications.length > 0
              ? notifications.slice(0, 10).map((n, i) => ({
                  id: n.id ?? `n-${i}`,
                  text: typeof n.content === "string" ? n.content : t("nav.notifications"),
                  iconName: n.type === "success" ? "status-positive" as const
                    : n.type === "error" ? "status-negative" as const
                    : n.type === "in-progress" ? "status-in-progress" as const
                    : "status-info" as const,
                }))
              : [{ id: "empty", text: t("nav.noNotifications"), disabled: true }],
            onItemClick: ({ detail }) => {
              const notif = notifications.find((n) => n.id === detail.id);
              if (notif?.dismissible && notif.onDismiss) {
                notif.onDismiss(new CustomEvent("dismiss"));
              }
            },
          },
          {
            type: "menu-dropdown",
            text: user ?? t("nav.user"),
            iconName: "user-profile",
            items: [
              { id: "settings", text: t("nav.settings") },
              { id: "signout", text: t("common.signOut") },
            ],
            onItemClick: ({ detail }) => {
              if (detail.id === "settings") {
                router.push("/settings");
                return;
              }

              if (detail.id === "signout") {
                logout();
              }
            },
          },
        ]}
      />
      <AppLayoutToolbar
        navigation={
          <SideNavigation
            header={navHeader}
            activeHref={pathname}
            items={navItems}
            onFollow={onNavFollow}
          />
        }
        navigationOpen={navOpen}
        onNavigationChange={({ detail }) => setNavOpen(detail.open)}
        breadcrumbs={<BreadcrumbGroup items={breadcrumbs} onFollow={onBreadcrumbFollow} />}
        notifications={<Flashbar items={notifications} />}
        toolsHide
        content={children}
      />
    </>
  );
}
