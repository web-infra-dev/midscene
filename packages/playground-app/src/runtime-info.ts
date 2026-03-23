import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type { DeviceType, ExecutionUxHint } from '@midscene/visualizer';

export interface PreviewConnectionInfo {
  type: 'none' | 'screenshot' | 'mjpeg' | 'scrcpy';
  mjpegUrl?: string;
  scrcpyUrl?: string;
  scrcpyPort?: number;
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

  if (preview.kind === 'mjpeg') {
    const mjpegPath = preview.mjpegPath || '/mjpeg';
    return {
      type: 'mjpeg',
      mjpegUrl: new URL(mjpegPath, `${serverUrl}/`).toString(),
    };
  }

  if (preview.kind === 'scrcpy') {
    const scrcpyPort = Number(preview.custom?.scrcpyPort);
    const resolvedScrcpyPort = Number.isFinite(scrcpyPort)
      ? scrcpyPort
      : undefined;
    const scrcpyUrl = resolvedScrcpyPort
      ? (() => {
          const url = new URL(serverUrl);
          url.port = String(resolvedScrcpyPort);
          url.pathname = '/';
          url.search = '';
          url.hash = '';
          return url.toString();
        })()
      : undefined;
    return {
      type: 'scrcpy',
      scrcpyPort: resolvedScrcpyPort,
      scrcpyUrl,
    };
  }

  return { type: 'screenshot' };
}
