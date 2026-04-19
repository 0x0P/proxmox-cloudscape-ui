"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth-context";

interface PermissionEntry {
  [path: string]: Record<string, number>;
}

interface UsePermissionsResult {
  permissions: PermissionEntry | null;
  loading: boolean;
  check: (path: string, privilege: string) => boolean;
  checkAny: (path: string, privileges: string[]) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { authenticated } = useAuth();
  const [permissions, setPermissions] = useState<PermissionEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!authenticated || fetchedRef.current) {
      setLoading(false);
      return;
    }

    let mounted = true;
    fetchedRef.current = true;

    const load = async () => {
      try {
        const res = await fetch("/api/proxmox/access/permissions", { cache: "no-store" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (mounted) {
          setPermissions(json.data ?? null);
        }
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, [authenticated]);

  const check = useCallback(
    (path: string, privilege: string): boolean => {
      if (!permissions) return true;

      const pathPerms = permissions[path];
      if (pathPerms && pathPerms[privilege] === 1) return true;

      const parts = path.split("/").filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const parentPath = "/" + parts.slice(0, i).join("/");
        const parentPerms = permissions[parentPath];
        if (parentPerms && parentPerms[privilege] === 1) return true;
      }

      const rootPerms = permissions["/"];
      return rootPerms?.[privilege] === 1;
    },
    [permissions],
  );

  const checkAny = useCallback(
    (path: string, privileges: string[]): boolean => {
      return privileges.some((p) => check(path, p));
    },
    [check],
  );

  return { permissions, loading, check, checkAny };
}
