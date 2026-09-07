import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type { DeviceType, ExecutionUxHint } from '@midscene/visualizer';

export interface PreviewConnectionInfo {
  type: 'none' | 'screenshot' | 'mjpeg' | 'scrcpy';
  deviceId?: string;
  mjpegUrl?: string;
  scrcpyUrl?: string;
  scrcpyPort?: number;
}

function isRemoteAndroidDeviceId(value: unknown): boolean {
  return typeof value === 'string' && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(value);
}

const VALID_DEVICE_TYPES: readonly DeviceType[] = [
  'android',
  'ios',
  'web',
  'harmony',
  'computer',
] as const;

const VALID_EXECUTION_UX_HINTS: readonly ExecutionUxHint[] = [
  'countdown-before-run',
] as const;

export function isValidDeviceType(type: string): type is DeviceType {
  return (VALID_DEVICE_TYPES as readonly string[]).includes(type);
}

export function normalizeRuntimeDeviceType(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  fallback: DeviceType,
): DeviceType {
  const candidates = [
    runtimeInfo?.platformId,
    runtimeInfo?.interface?.type,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (isValidDeviceType(normalized)) {
      return normalized;
    }
  }

  return fallback;
}

export function buildFallbackRuntimeInfo(
  previousRuntimeInfo: PlaygroundRuntimeInfo | null,
  interfaceInfo: RuntimeInterfaceInfo,
): PlaygroundRuntimeInfo {
  return {
    ...previousRuntimeInfo,
    interface: interfaceInfo,
    preview: previousRuntimeInfo?.preview || { kind: 'none', capabilities: [] },
    executionUxHints: previousRuntimeInfo?.executionUxHints || [],
    metadata: previousRuntimeInfo?.metadata || {},
  };
}

export interface RuntimeInterfaceInfo {
  type: string;
  description?: string;
  size?: { width: number; height: number };
}

export function filterValidExecutionUxHints(
  runtimeInfo: PlaygroundRuntimeInfo | null,
): ExecutionUxHint[] {
  return (runtimeInfo?.executionUxHints || []).filter(
    (hint): hint is ExecutionUxHint =>
      (VALID_EXECUTION_UX_HINTS as readonly string[]).includes(hint),
  );
}

export function resolvePreviewConnectionInfo(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  serverUrl: string,
): PreviewConnectionInfo {
  const preview = runtimeInfo?.preview;

  if (!preview || preview.kind === 'none' || preview.kind === 'custom') {
    return { type: 'none' };
  }

  const resolvedServerUrl =
    serverUrl ||
    (typeof window !== 'undefined' && window.location.origin) ||
    '';

  if (preview.kind === 'mjpeg') {
    const mjpegPath = preview.mjpegPath || '/mjpeg';
    if (!resolvedServerUrl) {
      return { type: 'screenshot' };
    }
    return {
      type: 'mjpeg',
      mjpegUrl: new URL(mjpegPath, `${resolvedServerUrl}/`).toString(),
    };
  }

  if (preview.kind === 'scrcpy') {
    const runtimeDeviceId =
      typeof runtimeInfo?.metadata?.deviceId === 'string'
        ? runtimeInfo.metadata.deviceId.trim()
        : undefined;

    if (isRemoteAndroidDeviceId(runtimeDeviceId)) {
      return { type: 'screenshot' };
    }

    const scrcpyPort = Number(preview.custom?.scrcpyPort);
    const resolvedScrcpyPort = Number.isFinite(scrcpyPort)
      ? scrcpyPort
      : undefined;
    const scrcpyUrl =
      resolvedScrcpyPort && resolvedServerUrl
        ? (() => {
            const url = new URL(resolvedServerUrl);
            // The CLI opens a local page even when the sidecar binds to a
            // specific LAN interface. Use that bind host for local pages;
            // remote pages keep their reachable hostname (e.g. behind NAT).
            if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
              const bindHost =
                typeof preview.custom?.scrcpyHost === 'string'
                  ? preview.custom.scrcpyHost.trim()
                  : '';
              if (bindHost && bindHost !== '0.0.0.0' && bindHost !== '::') {
                url.hostname =
                  bindHost.includes(':') && !bindHost.startsWith('[')
                    ? `[${bindHost}]`
                    : bindHost;
              } else if (bindHost === '::') {
                url.hostname = '[::1]';
              } else if (
                bindHost === '0.0.0.0' ||
                url.hostname === 'localhost'
              ) {
                // A wildcard is a listen address, never a connection address.
                url.hostname = '127.0.0.1';
              }
            }
            url.port = String(resolvedScrcpyPort);
            url.pathname = '/';
            url.search = '';
            url.hash = '';
            return url.toString();
          })()
        : undefined;
    return {
      deviceId: runtimeDeviceId,
      type: 'scrcpy',
      scrcpyPort: resolvedScrcpyPort,
      scrcpyUrl,
    };
  }

  return { type: 'screenshot' };
}
