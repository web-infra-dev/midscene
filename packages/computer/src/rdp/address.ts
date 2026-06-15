import type { RDPConnectionConfig } from './protocol';

export function normalizeRdpHost(host: string): string {
  const trimmed = host.trim();
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith('[') &&
    trimmed.endsWith(']') &&
    trimmed.includes(':')
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function formatRdpHost(host: string): string {
  const normalizedHost = normalizeRdpHost(host);
  return normalizedHost.includes(':') ? `[${normalizedHost}]` : normalizedHost;
}

export function formatRdpServerAddress(host: string, port: number): string {
  return `${formatRdpHost(host)}:${port}`;
}

export function normalizeRdpConnectionConfig<T extends RDPConnectionConfig>(
  config: T,
): T {
  return {
    ...config,
    host: normalizeRdpHost(config.host),
    ...(config.localAddress
      ? { localAddress: config.localAddress.trim() }
      : {}),
  };
}
