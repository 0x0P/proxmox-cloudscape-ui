"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { applyMode, Mode, applyDensity, Density } from "@cloudscape-design/global-styles";
import type { Language } from "@/app/lib/translations";

export type ThemeMode = "light" | "dark" | "system";
export type TableDensity = "comfortable" | "compact";
export type DateFormat = "relative" | "absolute" | "iso";

interface Settings {
  theme: ThemeMode;
  language: Language;
  tableDensity: TableDensity;
  refreshInterval: number;
  dateFormat: DateFormat;
  confirmPowerActions: boolean;
  showVmTags: boolean;
  pageSize: number;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  language: "en",
  tableDensity: "comfortable",
  refreshInterval: 30,
  dateFormat: "relative",
  confirmPowerActions: true,
  showVmTags: true,
  pageSize: 20,
};

interface SettingsContextValue extends Settings {
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  ...DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

const STORAGE_KEY = "pve-settings";

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function applyTheme(theme: ThemeMode) {
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyMode(prefersDark ? Mode.Dark : Mode.Light);
  } else {
    applyMode(theme === "dark" ? Mode.Dark : Mode.Light);
  }
}

function applyTableDensity(density: TableDensity) {
  applyDensity(density === "compact" ? Density.Compact : Density.Comfortable);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    applyTheme(loaded.theme);
    applyTableDensity(loaded.tableDensity);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (settings.theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [initialized, settings.theme]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);

      if (key === "theme") applyTheme(value as ThemeMode);
      if (key === "tableDensity") applyTableDensity(value as TableDensity);

      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    applyTheme(DEFAULT_SETTINGS.theme);
    applyTableDensity(DEFAULT_SETTINGS.tableDensity);
  }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}
