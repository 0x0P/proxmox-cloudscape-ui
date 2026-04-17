"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Toggle from "@cloudscape-design/components/toggle";
import Wizard, { type WizardProps } from "@cloudscape-design/components/wizard";
import { useTranslation } from "@/app/lib/use-translation";

interface ProxmoxResponse<T> {
  data: T;
}

interface NodeSummary {
  node: string;
  status: string;
}

interface ClusterNextId {
  vmid?: number | string;
}

interface StorageSummary {
  storage: string;
  content?: string;
}

interface StorageContentItem {
  volid: string;
}

interface NetworkInterfaceSummary {
  iface: string;
  type: string;
}

const OS_TYPE_OPTIONS: ReadonlyArray<SelectProps.Option> = [
  { label: "Linux", value: "l26" },
  { label: "Windows 11", value: "win11" },
  { label: "Windows 10", value: "win10" },
  { label: "Other", value: "other" },
];

const CPU_TYPE_OPTIONS: ReadonlyArray<SelectProps.Option> = [
  { label: "Host (best performance)", value: "host" },
  { label: "x86-64-v2-AES", value: "x86-64-v2-AES" },
  { label: "x86-64-v3", value: "x86-64-v3" },
  { label: "Default (kvm64)", value: "kvm64" },
];

const SCSI_CONTROLLER_OPTIONS: ReadonlyArray<SelectProps.Option> = [
  { label: "virtio-scsi-single", value: "virtio-scsi-single" },
  { label: "virtio-scsi-pci", value: "virtio-scsi-pci" },
  { label: "lsi", value: "lsi" },
];

const NETWORK_MODEL_OPTIONS: ReadonlyArray<SelectProps.Option> = [
  { label: "virtio", value: "virtio" },
  { label: "e1000", value: "e1000" },
  { label: "rtl8139", value: "rtl8139" },
];

const BIOS_OPTIONS: ReadonlyArray<SelectProps.Option> = [
  { label: "seabios", value: "seabios" },
  { label: "ovmf", value: "ovmf" },
];

async function fetchProxmox<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
  });

  const json = (await response.json().catch(() => null)) as ProxmoxResponse<T> | null;

  if (!response.ok) {
    const errorMessage =
      typeof json?.data === "string"
        ? json.data
        : `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return json?.data as T;
}

function optionLabel(option: SelectProps.Option | null) {
  return option?.label ?? "-";
}

function optionValue(option: SelectProps.Option | null) {
  return option?.value ?? "";
}

export default function CreateVirtualMachinePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nodeResourcesLoading, setNodeResourcesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashbarItems, setFlashbarItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  const [vmName, setVmName] = useState("");
  const [vmId, setVmId] = useState("");
  const [nodeOptions, setNodeOptions] = useState<ReadonlyArray<SelectProps.Option>>([]);
  const [selectedNode, setSelectedNode] = useState<SelectProps.Option | null>(null);
  const [selectedOsType, setSelectedOsType] = useState<SelectProps.Option | null>(OS_TYPE_OPTIONS[0] ?? null);
  const [isoOptions, setIsoOptions] = useState<ReadonlyArray<SelectProps.Option>>([]);
  const [selectedIso, setSelectedIso] = useState<SelectProps.Option | null>(null);
  const [cores, setCores] = useState("2");
  const [sockets, setSockets] = useState("1");
  const [selectedCpuType, setSelectedCpuType] = useState<SelectProps.Option | null>(CPU_TYPE_OPTIONS[0] ?? null);
  const [memory, setMemory] = useState("2048");
  const [diskSize, setDiskSize] = useState("32");
  const [storageOptions, setStorageOptions] = useState<ReadonlyArray<SelectProps.Option>>([]);
  const [selectedStorage, setSelectedStorage] = useState<SelectProps.Option | null>(null);
  const [selectedScsiController, setSelectedScsiController] = useState<SelectProps.Option | null>(
    SCSI_CONTROLLER_OPTIONS[0] ?? null,
  );
  const [bridgeOptions, setBridgeOptions] = useState<ReadonlyArray<SelectProps.Option>>([]);
  const [selectedBridge, setSelectedBridge] = useState<SelectProps.Option | null>(null);
  const [selectedNetworkModel, setSelectedNetworkModel] = useState<SelectProps.Option | null>(
    NETWORK_MODEL_OPTIONS[0] ?? null,
  );
  const [firewallEnabled, setFirewallEnabled] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [qemuAgentEnabled, setQemuAgentEnabled] = useState(true);
  const [selectedBios, setSelectedBios] = useState<SelectProps.Option | null>(BIOS_OPTIONS[0] ?? null);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [nodes, nextId] = await Promise.all([
        fetchProxmox<NodeSummary[]>("/api/proxmox/nodes"),
        fetchProxmox<number | string | ClusterNextId>("/api/proxmox/cluster/nextid"),
      ]);

      const onlineNodeOptions = (nodes ?? [])
        .filter((node) => node.status === "online")
        .map((node) => ({ label: node.node, value: node.node }));

      const normalizedNextId =
        typeof nextId === "object" && nextId !== null && "vmid" in nextId ? nextId.vmid : nextId;

      setNodeOptions(onlineNodeOptions);
      setVmId(normalizedNextId ? String(normalizedNextId) : "");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("vms.failedToLoadCreation"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const node = optionValue(selectedNode);

    if (!node) {
      setIsoOptions([]);
      setSelectedIso(null);
      setStorageOptions([]);
      setSelectedStorage(null);
      setBridgeOptions([]);
      setSelectedBridge(null);
      return;
    }

    let cancelled = false;

    const loadNodeResources = async () => {
      try {
        setNodeResourcesLoading(true);
        const storages = await fetchProxmox<StorageSummary[]>(`/api/proxmox/nodes/${node}/storage`);

        if (cancelled) {
          return;
        }

        const imageStorageOptions = (storages ?? [])
          .filter((storage) => storage.content?.split(",").includes("images"))
          .map((storage) => ({ label: storage.storage, value: storage.storage }));

        const isoStorages = (storages ?? []).filter((storage) => storage.content?.split(",").includes("iso"));

        const [isoGroups, networks] = await Promise.all([
          Promise.all(
            isoStorages.map(async (storage) => {
              try {
                return await fetchProxmox<StorageContentItem[]>(
                  `/api/proxmox/nodes/${node}/storage/${storage.storage}/content?content=iso`,
                );
              } catch {
                return [];
              }
            }),
          ),
          fetchProxmox<NetworkInterfaceSummary[]>(`/api/proxmox/nodes/${node}/network`),
        ]);

        if (cancelled) {
          return;
        }

        const isoMap = new Map<string, SelectProps.Option>();
        isoGroups.flat().forEach((item) => {
          if (item?.volid) {
            isoMap.set(item.volid, { label: item.volid, value: item.volid });
          }
        });

        const networkBridgeOptions = (networks ?? [])
          .filter((network) => network.type === "bridge")
          .map((network) => ({ label: network.iface, value: network.iface }));

        const nextIsoOptions = Array.from(isoMap.values()).sort((left, right) =>
          optionLabel(left).localeCompare(optionLabel(right)),
        );

        setStorageOptions(imageStorageOptions);
        setSelectedStorage((current) =>
          current && imageStorageOptions.some((option) => option.value === current.value) ? current : null,
        );
        setIsoOptions(nextIsoOptions);
        setSelectedIso((current) => (current && isoMap.has(String(current.value)) ? current : null));
        setBridgeOptions(networkBridgeOptions);
        setSelectedBridge((current) =>
          current && networkBridgeOptions.some((option) => option.value === current.value) ? current : null,
        );
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t("vms.failedToLoadNodeResources"));
          setIsoOptions([]);
          setSelectedIso(null);
          setStorageOptions([]);
          setSelectedStorage(null);
          setBridgeOptions([]);
          setSelectedBridge(null);
        }
      } finally {
        if (!cancelled) {
          setNodeResourcesLoading(false);
        }
      }
    };

    void loadNodeResources();

    return () => {
      cancelled = true;
    };
  }, [selectedNode, t]);

  const validateForm = useCallback(() => {
    if (!vmName.trim()) {
      return t("vms.vmNameRequired");
    }
    if (!optionValue(selectedNode)) {
      return t("vms.nodeRequired");
    }
    if (!vmId.trim()) {
      return t("vms.vmIdRequired");
    }
    if (!optionValue(selectedStorage)) {
      return t("vms.storageRequired");
    }
    if (!optionValue(selectedBridge)) {
      return t("vms.bridgeRequired");
    }
    return null;
  }, [selectedBridge, selectedNode, selectedStorage, t, vmId, vmName]);

  const handleSubmit = useCallback(async () => {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      setActiveStepIndex(0);
      return;
    }

    const node = optionValue(selectedNode);
    const storage = optionValue(selectedStorage);
    const isoVolid = optionValue(selectedIso);
    const body = new URLSearchParams({
      vmid: vmId,
      name: vmName.trim(),
      memory,
      cores,
      sockets,
      cpu: optionValue(selectedCpuType),
      ostype: optionValue(selectedOsType),
      scsihw: optionValue(selectedScsiController),
      scsi0: `${storage}:${diskSize}`,
      net0: `model=${optionValue(selectedNetworkModel)},bridge=${optionValue(selectedBridge)},firewall=${
        firewallEnabled ? "1" : "0"
      }`,
      boot: "order=scsi0;ide2;net0",
      agent: qemuAgentEnabled ? "1" : "0",
      onboot: startOnBoot ? "1" : "0",
      bios: optionValue(selectedBios),
    });

    if (isoVolid) {
      body.set("ide2", `${isoVolid},media=cdrom`);
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch(`/api/proxmox/nodes/${node}/qemu`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const json = (await response.json().catch(() => null)) as ProxmoxResponse<unknown> | null;

      if (!response.ok) {
        const errorMessage =
          typeof json?.data === "string"
            ? json.data
            : `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      setFlashbarItems([
        {
          type: "success",
          content: t("vms.vmCreated").replace("{name}", vmName.trim()),
          dismissible: true,
          id: "vm-create-success",
        },
      ]);

      window.setTimeout(() => {
        router.push("/vms");
      }, 2000);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("vms.failedToCreate"));
    } finally {
      setSubmitting(false);
    }
  }, [
    cores,
    diskSize,
    firewallEnabled,
    memory,
    qemuAgentEnabled,
    router,
    selectedBios,
    selectedBridge,
    selectedCpuType,
    selectedIso,
    selectedNetworkModel,
    selectedNode,
    selectedOsType,
    selectedScsiController,
    selectedStorage,
    sockets,
    startOnBoot,
    validateForm,
    t,
    vmId,
    vmName,
  ]);

  const reviewSections = useMemo(
    () => [
      {
        title: t("vms.instanceDetails"),
        stepIndex: 0,
        items: [
          { label: t("vms.vmName"), value: vmName || "-" },
          { label: t("vms.node"), value: optionLabel(selectedNode) },
          { label: t("vms.vmIdLabel"), value: vmId || "-" },
        ],
      },
      {
        title: t("vms.operatingSystem"),
        stepIndex: 1,
        items: [
          { label: t("vms.osType"), value: optionLabel(selectedOsType) },
          { label: t("vms.isoImageLabel"), value: optionLabel(selectedIso) },
        ],
      },
      {
        title: t("vms.instanceType"),
        stepIndex: 2,
        items: [
          { label: t("vms.cpuCores"), value: cores },
          { label: t("vms.cpuSockets"), value: sockets },
          { label: t("vms.cpuType"), value: optionLabel(selectedCpuType) },
          { label: t("vms.memoryMb"), value: memory },
        ],
      },
      {
        title: t("vms.storageAndNetwork"),
        stepIndex: 3,
        items: [
          { label: t("vms.diskSizeGb"), value: diskSize },
          { label: t("vms.storageLabel"), value: optionLabel(selectedStorage) },
          { label: t("vms.scsiController"), value: optionLabel(selectedScsiController) },
          { label: t("vms.networkBridge"), value: optionLabel(selectedBridge) },
          { label: t("vms.networkModel"), value: optionLabel(selectedNetworkModel) },
          { label: t("vms.firewall"), value: firewallEnabled ? t("network.yes") : t("network.no") },
          { label: t("vms.startOnBoot"), value: startOnBoot ? t("network.yes") : t("network.no") },
          { label: t("vms.qemuAgent"), value: qemuAgentEnabled ? t("network.yes") : t("network.no") },
          { label: t("vms.bios"), value: optionLabel(selectedBios) },
        ],
      },
    ],
    [
      cores,
      diskSize,
      firewallEnabled,
      memory,
      qemuAgentEnabled,
      selectedBios,
      selectedBridge,
      selectedCpuType,
      selectedIso,
      selectedNetworkModel,
      selectedNode,
      selectedOsType,
      selectedScsiController,
      selectedStorage,
      sockets,
      startOnBoot,
      t,
      vmId,
      vmName,
    ],
  );

  const steps = useMemo<WizardProps.Step[]>(
    () => [
      {
        title: t("vms.nameAndNode"),
        content: (
          <Container header={<Header variant="h2">{t("vms.instanceDetails")}</Header>}>
            <SpaceBetween size="l">
              <FormField label={t("vms.vmName")} description={t("vms.vmNameDesc")} stretch>
                <Input value={vmName} onChange={({ detail }) => setVmName(detail.value)} placeholder={t("vms.vmNamePlaceholder")} />
              </FormField>
              <FormField label={t("vms.node")} description={t("vms.nodeDesc")} stretch>
                <Select
                  selectedOption={selectedNode}
                  onChange={({ detail }) => setSelectedNode(detail.selectedOption)}
                  options={nodeOptions}
                  placeholder={t("vms.chooseNode")}
                  loadingText={t("storage.loadingNodes")}
                  filteringType="auto"
                  statusType={loading ? "loading" : "finished"}
                />
              </FormField>
              <FormField label={t("vms.vmIdLabel")} description={t("vms.vmIdDesc")} stretch>
                <Input value={vmId} type="number" inputMode="numeric" onChange={({ detail }) => setVmId(detail.value)} />
              </FormField>
            </SpaceBetween>
          </Container>
        ),
      },
      {
        title: t("vms.osImage"),
        content: (
          <Container header={<Header variant="h2">{t("vms.operatingSystem")}</Header>}>
            <SpaceBetween size="l">
              <FormField label={t("vms.osType")} stretch>
                <Select
                  selectedOption={selectedOsType}
                  onChange={({ detail }) => setSelectedOsType(detail.selectedOption)}
                  options={OS_TYPE_OPTIONS}
                />
              </FormField>
              <FormField label={t("vms.isoImageLabel")} stretch description={!selectedNode ? t("vms.selectNodeFirst") : t("vms.optionalBootMedia")}>
                <Select
                  selectedOption={selectedIso}
                  onChange={({ detail }) => setSelectedIso(detail.selectedOption)}
                  options={isoOptions}
                  placeholder={!selectedNode ? t("vms.selectNodeFirst") : t("vms.chooseIso")}
                  empty={t("vms.noIsoAvailable")}
                  loadingText={t("vms.loadingIso")}
                  filteringType="auto"
                  statusType={!selectedNode ? "pending" : nodeResourcesLoading ? "loading" : "finished"}
                  disabled={!selectedNode}
                />
              </FormField>
            </SpaceBetween>
          </Container>
        ),
      },
      {
        title: t("vms.instanceType"),
        content: (
          <Container header={<Header variant="h2">{t("vms.instanceType")}</Header>}>
            <ColumnLayout columns={2} variant="text-grid">
              <FormField label={t("vms.cpuCores")} stretch>
                <Input value={cores} type="number" inputMode="numeric" onChange={({ detail }) => setCores(detail.value)} />
              </FormField>
              <FormField label={t("vms.cpuSockets")} stretch>
                <Input value={sockets} type="number" inputMode="numeric" onChange={({ detail }) => setSockets(detail.value)} />
              </FormField>
              <FormField label={t("vms.cpuType")} stretch>
                <Select
                  selectedOption={selectedCpuType}
                  onChange={({ detail }) => setSelectedCpuType(detail.selectedOption)}
                  options={CPU_TYPE_OPTIONS}
                />
              </FormField>
              <FormField label={t("vms.memoryMb")} stretch>
                <Input value={memory} type="number" inputMode="numeric" onChange={({ detail }) => setMemory(detail.value)} />
              </FormField>
            </ColumnLayout>
          </Container>
        ),
      },
      {
        title: t("vms.storageAndNetwork"),
        content: (
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">{t("storage.storage")}</Header>}>
              <ColumnLayout columns={2} variant="text-grid">
                <FormField label={t("vms.diskSizeGb")} stretch>
                  <Input
                    value={diskSize}
                    type="number"
                    inputMode="numeric"
                    onChange={({ detail }) => setDiskSize(detail.value)}
                  />
                </FormField>
                <FormField label={t("vms.storageLabel")} stretch>
                  <Select
                    selectedOption={selectedStorage}
                    onChange={({ detail }) => setSelectedStorage(detail.selectedOption)}
                    options={storageOptions}
                    placeholder={!selectedNode ? t("vms.selectNodeFirst") : t("vms.chooseStorage")}
                    empty={t("vms.noImageStorage")}
                    loadingText={t("storage.loadingStorage")}
                    statusType={!selectedNode ? "pending" : nodeResourcesLoading ? "loading" : "finished"}
                    disabled={!selectedNode}
                  />
                </FormField>
                <FormField label={t("vms.scsiController")} stretch>
                  <Select
                    selectedOption={selectedScsiController}
                    onChange={({ detail }) => setSelectedScsiController(detail.selectedOption)}
                    options={SCSI_CONTROLLER_OPTIONS}
                  />
                </FormField>
              </ColumnLayout>
            </Container>
            <Container header={<Header variant="h2">{t("containers.network")}</Header>}>
              <ColumnLayout columns={2} variant="text-grid">
                <FormField label={t("vms.networkBridge")} stretch>
                  <Select
                    selectedOption={selectedBridge}
                    onChange={({ detail }) => setSelectedBridge(detail.selectedOption)}
                    options={bridgeOptions}
                    placeholder={!selectedNode ? t("vms.selectNodeFirst") : t("vms.chooseBridge")}
                    empty={t("vms.noBridgesAvailable")}
                    loadingText={t("vms.loadingBridges")}
                    statusType={!selectedNode ? "pending" : nodeResourcesLoading ? "loading" : "finished"}
                    disabled={!selectedNode}
                  />
                </FormField>
                <FormField label={t("vms.networkModel")} stretch>
                  <Select
                    selectedOption={selectedNetworkModel}
                    onChange={({ detail }) => setSelectedNetworkModel(detail.selectedOption)}
                    options={NETWORK_MODEL_OPTIONS}
                  />
                </FormField>
                <FormField label={t("vms.firewall")} stretch>
                  <Checkbox checked={firewallEnabled} onChange={({ detail }) => setFirewallEnabled(detail.checked)}>
                    {t("vms.firewallDesc")}
                  </Checkbox>
                </FormField>
              </ColumnLayout>
            </Container>
            <Container header={<Header variant="h2">{t("vms.bootOptions")}</Header>}>
              <ColumnLayout columns={2} variant="text-grid">
                <FormField label={t("vms.startOnBoot")} stretch>
                  <Toggle checked={startOnBoot} onChange={({ detail }) => setStartOnBoot(detail.checked)}>
                    {t("vms.startOnBootDesc")}
                  </Toggle>
                </FormField>
                <FormField label={t("vms.qemuAgent")} stretch>
                  <Toggle checked={qemuAgentEnabled} onChange={({ detail }) => setQemuAgentEnabled(detail.checked)}>
                    {t("vms.qemuAgentDesc")}
                  </Toggle>
                </FormField>
                <FormField label={t("vms.bios")} stretch>
                  <Select selectedOption={selectedBios} onChange={({ detail }) => setSelectedBios(detail.selectedOption)} options={BIOS_OPTIONS} />
                </FormField>
              </ColumnLayout>
            </Container>
          </SpaceBetween>
        ),
      },
      {
        title: t("vms.reviewAndLaunch"),
        content: (
          <SpaceBetween size="l">
            {reviewSections.map((section) => (
              <Container
                key={section.title}
                header={
                  <Header
                    variant="h2"
                    actions={
                      <Button variant="normal" onClick={() => setActiveStepIndex(section.stepIndex)}>
                        {t("common.edit")}
                      </Button>
                    }
                  >
                    {section.title}
                  </Header>
                }
              >
                <KeyValuePairs columns={2} items={section.items} />
              </Container>
            ))}
          </SpaceBetween>
        ),
      },
    ],
    [
      activeStepIndex,
      bridgeOptions,
      cores,
      diskSize,
      firewallEnabled,
      isoOptions,
      loading,
      memory,
      nodeOptions,
      nodeResourcesLoading,
      qemuAgentEnabled,
      reviewSections,
      selectedBios,
      selectedBridge,
      selectedCpuType,
      selectedIso,
      selectedNetworkModel,
      selectedNode,
      selectedOsType,
      selectedScsiController,
      selectedStorage,
      sockets,
      startOnBoot,
      storageOptions,
      t,
      vmId,
      vmName,
    ],
  );

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{t("vms.launchInstance")}</Header>
      {flashbarItems.length > 0 ? <Flashbar items={flashbarItems} /> : null}
      {error ? (
        <Alert type="error" header={t("vms.unableToCreate")}>
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Container>
          <Box color="text-body-secondary">{t("vms.loadingWizard")}</Box>
        </Container>
      ) : (
        <Wizard
          steps={steps}
          activeStepIndex={activeStepIndex}
          onNavigate={({ detail }) => setActiveStepIndex(detail.requestedStepIndex)}
          onCancel={() => router.push("/vms")}
          onSubmit={() => void handleSubmit()}
          i18nStrings={{
            submitButton: t("vms.submitButton"),
            cancelButton: t("vms.cancelButton"),
            previousButton: t("vms.previousButton"),
            nextButton: t("vms.nextButton"),
            stepNumberLabel: (n) => t("vms.stepNumberLabel").replace("{n}", String(n)),
            collapsedStepsLabel: (n, total) =>
              t("vms.collapsedStepsLabel").replace("{n}", String(n)).replace("{total}", String(total)),
          }}
          isLoadingNextStep={submitting}
        />
      )}
    </SpaceBetween>
  );
}
