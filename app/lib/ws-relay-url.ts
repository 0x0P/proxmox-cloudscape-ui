type RelayLocation = Readonly<{
  protocol: string;
  hostname: string;
  host: string;
}>;

const getRelayHost = ({ hostname, host }: RelayLocation, relayPort?: string): string => {
  if (relayPort) {
    return `${hostname}:${relayPort}`;
  }

  const buildTimeRelayPort = process.env.NEXT_PUBLIC_WS_RELAY_PORT;
  return buildTimeRelayPort ? `${hostname}:${buildTimeRelayPort}` : host;
};

export const buildWsRelayUrl = (
  location: RelayLocation,
  query: URLSearchParams,
  relayPort?: string,
): string => {
  const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
  return `${wsProtocol}://${getRelayHost(location, relayPort)}/ws?${query.toString()}`;
};
