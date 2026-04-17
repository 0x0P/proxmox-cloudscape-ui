"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";

interface TrackedTask {
  upid: string;
  node: string;
  description: string;
  startedAt: number;
}

interface NotificationContextValue {
  notifications: FlashbarProps.MessageDefinition[];
  addSuccess: (message: string) => void;
  addError: (message: string) => void;
  addInfo: (message: string) => void;
  trackTask: (upid: string, node: string, description: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  addSuccess: () => {},
  addError: () => {},
  addInfo: () => {},
  trackTask: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

let notificationId = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [trackedTasks, setTrackedTasks] = useState<TrackedTask[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (type: FlashbarProps.Type, message: string, autoDismiss = true) => {
      const id = `notif-${++notificationId}`;
      setNotifications((prev) => [
        {
          id,
          type,
          content: message,
          dismissible: true,
          onDismiss: () => dismiss(id),
        },
        ...prev,
      ]);

      if (autoDismiss) {
        setTimeout(() => dismiss(id), type === "error" ? 10000 : 5000);
      }
    },
    [dismiss],
  );

  const addSuccess = useCallback((message: string) => addNotification("success", message), [addNotification]);
  const addError = useCallback((message: string) => addNotification("error", message), [addNotification]);
  const addInfo = useCallback((message: string) => addNotification("info", message), [addNotification]);

  const trackTask = useCallback(
    (upid: string, node: string, description: string) => {
      setTrackedTasks((prev) => [...prev, { upid, node, description, startedAt: Date.now() }]);

      const id = `task-${++notificationId}`;
      setNotifications((prev) => [
        {
          id,
          type: "in-progress" as FlashbarProps.Type,
          content: description,
          dismissible: false,
          loading: true,
        },
        ...prev,
      ]);
    },
    [],
  );

  const pollTasks = useCallback(async () => {
    if (trackedTasks.length === 0) return;

    const completed: TrackedTask[] = [];

    await Promise.all(
      trackedTasks.map(async (task) => {
        try {
          const res = await fetch(
            `/api/proxmox/nodes/${task.node}/tasks/${encodeURIComponent(task.upid)}/status`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const json = await res.json();
          const status = json.data?.status;

          if (status && status !== "running") {
            completed.push(task);
            const ok = status === "OK" || (typeof status === "string" && status.startsWith("OK"));

            setNotifications((prev) =>
              prev
                .filter((n) => !n.loading || n.content !== task.description)
                .concat([
                  {
                    id: `task-done-${++notificationId}`,
                    type: ok ? "success" : "error",
                    content: `${task.description}: ${status}`,
                    dismissible: true,
                    onDismiss: () => dismiss(`task-done-${notificationId}`),
                  },
                ]),
            );

            setTimeout(() => {
              setNotifications((prev) =>
                prev.filter((n) => n.content !== `${task.description}: ${status}`),
              );
            }, ok ? 5000 : 10000);
          }
        } catch {
          completed.push(task);
        }
      }),
    );

    if (completed.length > 0) {
      setTrackedTasks((prev) => prev.filter((t) => !completed.some((c) => c.upid === t.upid)));
    }
  }, [trackedTasks, dismiss]);

  useEffect(() => {
    if (trackedTasks.length > 0) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => void pollTasks(), 2000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [trackedTasks.length, pollTasks]);

  return (
    <NotificationContext.Provider value={{ notifications, addSuccess, addError, addInfo, trackTask }}>
      {children}
    </NotificationContext.Provider>
  );
}
