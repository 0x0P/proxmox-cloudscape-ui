"use client";

import { useState } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import Toggle from "@cloudscape-design/components/toggle";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Alert from "@cloudscape-design/components/alert";
import { useSettings, type ThemeMode, type TableDensity, type DateFormat } from "@/app/components/settings-context";
import { useTranslation } from "@/app/lib/use-translation";
import type { Language } from "@/app/lib/translations";

const PAGE_SIZE_OPTIONS = [
  { label: "10", value: "10" },
  { label: "20", value: "20" },
  { label: "50", value: "50" },
  { label: "100", value: "100" },
];


export default function SettingsPage() {
  const settings = useSettings();
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);

  const themeOptions = [
    { label: t("settings.dark"), value: "dark", description: t("settings.darkDescription") },
    { label: t("settings.light"), value: "light", description: t("settings.lightDescription") },
    { label: t("settings.system"), value: "system", description: t("settings.systemDescription") },
  ];

  const densityOptions = [
    { label: t("settings.comfortable"), value: "comfortable", description: t("settings.comfortableDescription") },
    { label: t("settings.compact"), value: "compact", description: t("settings.compactDescription") },
  ];

  const dateFormatOptions = [
    { label: t("settings.relative"), value: "relative", description: t("settings.relativeDescription") },
    { label: t("settings.absolute"), value: "absolute", description: t("settings.absoluteDescription") },
    { label: t("settings.iso8601"), value: "iso", description: t("settings.isoDescription") },
  ];

  const refreshOptions = [
    { label: `15 ${t("settings.seconds")}`, value: "15" },
    { label: `30 ${t("settings.seconds")}`, value: "30" },
    { label: `1 ${t("settings.minute")}`, value: "60" },
    { label: `5 ${t("settings.minutes")}`, value: "300" },
    { label: t("settings.disabled"), value: "0" },
  ];

  const languageOptions = [
    { label: t("settings.english"), value: "en" },
    { label: t("settings.korean"), value: "ko" },
  ];

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <Button onClick={() => { settings.reset(); showSaved(); }}>Reset to defaults</Button>
          </SpaceBetween>
        }
      >
        {t("settings.settings")}
      </Header>

      {saved && <Alert type="success" dismissible onDismiss={() => setSaved(false)}>{t("common.settingsSaved")}</Alert>}

      <Container header={<Header variant="h2">{t("settings.appearance")}</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          <FormField label={t("settings.theme")} description={t("settings.themeDescription")}>
            <Select
              selectedOption={themeOptions.find((o) => o.value === settings.theme) ?? themeOptions[0]}
              options={themeOptions}
              onChange={({ detail }) => {
                settings.update("theme", detail.selectedOption.value as ThemeMode);
                showSaved();
              }}
            />
          </FormField>
          <FormField label={t("settings.tableDensity")} description={t("settings.tableDensityDescription")}>
            <Select
              selectedOption={densityOptions.find((o) => o.value === settings.tableDensity) ?? densityOptions[0]}
              options={densityOptions}
              onChange={({ detail }) => {
                settings.update("tableDensity", detail.selectedOption.value as TableDensity);
                showSaved();
              }}
            />
          </FormField>
          <FormField label={t("settings.language")} description={t("settings.languageDescription")}>
            <Select
              selectedOption={languageOptions.find((o) => o.value === settings.language) ?? languageOptions[0]}
              options={languageOptions}
              onChange={({ detail }) => {
                settings.update("language", detail.selectedOption.value as Language);
                showSaved();
              }}
            />
          </FormField>
        </ColumnLayout>
      </Container>

      <Container header={<Header variant="h2">{t("settings.dataDisplay")}</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          <FormField label={t("settings.dateFormat")} description={t("settings.dataDisplayDescription")}>
            <Select
              selectedOption={dateFormatOptions.find((o) => o.value === settings.dateFormat) ?? dateFormatOptions[0]}
              options={dateFormatOptions}
              onChange={({ detail }) => {
                settings.update("dateFormat", detail.selectedOption.value as DateFormat);
                showSaved();
              }}
            />
          </FormField>
          <FormField label={t("settings.itemsPerPage")} description={t("settings.itemsPerPageDescription")}>
            <Select
              selectedOption={PAGE_SIZE_OPTIONS.find((o) => o.value === String(settings.pageSize)) ?? PAGE_SIZE_OPTIONS[1]}
              options={PAGE_SIZE_OPTIONS}
              onChange={({ detail }) => {
                settings.update("pageSize", Number(detail.selectedOption.value));
                showSaved();
              }}
            />
          </FormField>
        </ColumnLayout>
      </Container>

      <Container header={<Header variant="h2">{t("settings.monitoring")}</Header>}>
        <ColumnLayout columns={2} variant="text-grid">
          <FormField label={t("settings.autoRefreshInterval")} description={t("settings.monitoringDescription")}>
            <Select
              selectedOption={refreshOptions.find((o) => o.value === String(settings.refreshInterval)) ?? refreshOptions[1]}
              options={refreshOptions}
              onChange={({ detail }) => {
                settings.update("refreshInterval", Number(detail.selectedOption.value));
                showSaved();
              }}
            />
          </FormField>
          <Box />
        </ColumnLayout>
      </Container>

      <Container header={<Header variant="h2">{t("settings.behavior")}</Header>}>
        <SpaceBetween size="l">
          <Toggle
            checked={settings.confirmPowerActions}
            onChange={({ detail }) => {
              settings.update("confirmPowerActions", detail.checked);
              showSaved();
            }}
          >
            {t("settings.behaviorConfirmDescription")}
          </Toggle>
          <Toggle
            checked={settings.showVmTags}
            onChange={({ detail }) => {
              settings.update("showVmTags", detail.checked);
              showSaved();
            }}
          >
            {t("settings.behaviorTagsDescription")}
          </Toggle>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
