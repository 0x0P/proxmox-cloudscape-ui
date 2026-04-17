"use client";

import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useTranslation } from "@/app/lib/use-translation";

const REALM_OPTIONS: ReadonlyArray<SelectProps.Option> = [
  { label: "Linux PAM", value: "pam" },
  { label: "Proxmox VE Authentication", value: "pve" },
];

interface LoginResponse {
  error?: string;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [realm, setRealm] = useState<SelectProps.Option>(REALM_OPTIONS[0]!);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          realm: realm.value,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as LoginResponse;
        throw new Error(data.error ?? t("auth.loginFailed"));
      }

      window.location.href = "/";
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box padding={{ top: "xxxl", horizontal: "l", bottom: "xxxl" }}>
      <Box textAlign="center" margin={{ bottom: "xl" }}>
        <Header variant="h1">{t("common.loginTitle")}</Header>
        <Box color="text-body-secondary">{t("auth.signInToDashboard")}</Box>
      </Box>
      <div
        style={{
          maxWidth: "420px",
          margin: "0 auto",
        }}
      >
        <Container header={<Header variant="h2">{t("auth.login")}</Header>}>
          <SpaceBetween size="l">
            {error ? <Alert type="error">{error}</Alert> : null}
            <FormField label={t("auth.username")}>
              <Input
                value={username}
                placeholder="root"
                autoComplete={false}
                onChange={({ detail }) => setUsername(detail.value)}
              />
            </FormField>
            <FormField label={t("auth.password")}>
              <Input
                value={password}
                type="password"
                onChange={({ detail }) => setPassword(detail.value)}
              />
            </FormField>
            <FormField label={t("auth.realm")}>
              <Select
                selectedOption={realm}
                options={REALM_OPTIONS}
                onChange={({ detail }) => setRealm(detail.selectedOption)}
              />
            </FormField>
            <Button variant="primary" fullWidth loading={loading} onClick={() => void handleSubmit()}>
              {t("auth.logIn")}
            </Button>
          </SpaceBetween>
        </Container>
      </div>
    </Box>
  );
}
