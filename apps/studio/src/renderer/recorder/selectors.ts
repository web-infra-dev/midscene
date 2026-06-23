import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type { StudioPlatformId } from '@shared/electron-contract';
import {
  normalizeStudioPlatformId,
  resolveConnectedDeviceId,
  resolveConnectedDeviceLabel,
  resolveSelectedDeviceId,
} from '../playground/selectors';
import type { StudioPlaygroundContextValue } from '../playground/types';
import type { StudioRecorderTarget, StudioRecordingSession } from './types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPrimitiveSessionValue(
  value: unknown,
): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function normalizePort(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function resolveRecorderPlatformId(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): StudioPlatformId | undefined {
  return (
    normalizeStudioPlatformId(runtimeInfo?.platformId) ||
    normalizeStudioPlatformId(runtimeInfo?.interface?.type) ||
    normalizeStudioPlatformId(formValues.platformId)
  );
}

function resolveNamespacedValue(
  platformId: StudioPlatformId,
  key: string,
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): unknown {
  const metadata = runtimeInfo?.metadata || {};
  const namespacedKey = `${platformId}.${key}`;
  return metadata[key] ?? formValues[namespacedKey] ?? formValues[key];
}

function compactValues(
  values: Record<string, unknown>,
): StudioRecorderTarget['values'] {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string | number | boolean] =>
        isPrimitiveSessionValue(entry[1]),
    ),
  );
}

export function resolveStudioRecorderTarget(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  formValues: Record<string, unknown>,
): StudioRecorderTarget | null {
  const platformId = resolveRecorderPlatformId(runtimeInfo, formValues);
  if (!platformId) {
    return null;
  }

  const metadata = runtimeInfo?.metadata || {};
  const label = resolveConnectedDeviceLabel(runtimeInfo, {
    emptyLabel: platformId,
  });
  const connectedDeviceId = resolveConnectedDeviceId(runtimeInfo);
  const selectedDeviceId = resolveSelectedDeviceId({
    ...formValues,
    platformId,
  });
  const deviceId = connectedDeviceId ?? selectedDeviceId;

  switch (platformId) {
    case 'web': {
      const url =
        resolveNamespacedValue('web', 'url', runtimeInfo, formValues) ??
        (isNonEmptyString(metadata.sessionDisplayName)
          ? metadata.sessionDisplayName
          : undefined);
      if (!isNonEmptyString(url)) {
        return null;
      }
      return {
        platformId,
        deviceId: url,
        label: isNonEmptyString(label) ? label : url,
        values: compactValues({
          url,
          viewportWidth: resolveNamespacedValue(
            'web',
            'viewportWidth',
            runtimeInfo,
            formValues,
          ),
          viewportHeight: resolveNamespacedValue(
            'web',
            'viewportHeight',
            runtimeInfo,
            formValues,
          ),
          headed: resolveNamespacedValue(
            'web',
            'headed',
            runtimeInfo,
            formValues,
          ),
        }),
      };
    }
    case 'ios': {
      const host =
        resolveNamespacedValue('ios', 'host', runtimeInfo, formValues) ??
        metadata.wdaHost;
      const port = normalizePort(
        resolveNamespacedValue('ios', 'port', runtimeInfo, formValues) ??
          metadata.wdaPort,
      );
      if (!isNonEmptyString(host) || port === undefined) {
        return null;
      }
      return {
        platformId,
        deviceId: deviceId ?? `${host}:${port}`,
        label,
        values: {
          host,
          port,
        },
      };
    }
    case 'computer': {
      const displayId = resolveNamespacedValue(
        'computer',
        'displayId',
        runtimeInfo,
        formValues,
      );
      if (!isPrimitiveSessionValue(displayId) && !deviceId) {
        return null;
      }
      return {
        platformId,
        deviceId,
        label,
        values: compactValues({
          displayId: displayId ?? deviceId,
        }),
      };
    }
    case 'android':
    case 'harmony': {
      const targetDeviceId =
        resolveNamespacedValue(
          platformId,
          'deviceId',
          runtimeInfo,
          formValues,
        ) ?? deviceId;
      if (!isPrimitiveSessionValue(targetDeviceId)) {
        return null;
      }
      return {
        platformId,
        deviceId: String(targetDeviceId),
        label,
        values: {
          deviceId: targetDeviceId,
        },
      };
    }
    default:
      return null;
  }
}

export function createStudioRecorderTargetSignature(
  target: StudioRecorderTarget | null,
): string | null {
  if (!target) {
    return null;
  }

  return JSON.stringify({
    platformId: target.platformId,
    deviceId: target.deviceId,
    values: Object.fromEntries(Object.entries(target.values).sort()),
  });
}

function createStudioRecorderHistoryTargetSignature(
  target: StudioRecorderTarget | null,
): string | null {
  if (!target) {
    return null;
  }

  switch (target.platformId) {
    case 'web':
      return JSON.stringify({ platformId: target.platformId });
    case 'android':
    case 'harmony':
      return JSON.stringify({
        platformId: target.platformId,
        deviceId: target.deviceId ?? target.values.deviceId,
      });
    case 'computer':
      return JSON.stringify({
        platformId: target.platformId,
        displayId: target.values.displayId ?? target.deviceId,
      });
    case 'ios':
      return JSON.stringify({
        platformId: target.platformId,
        host: target.values.host,
        port: target.values.port,
      });
    default:
      return createStudioRecorderTargetSignature(target);
  }
}

export function isStudioRecorderSessionForTarget(
  session: StudioRecordingSession,
  target: StudioRecorderTarget | null,
) {
  const targetSignature = createStudioRecorderHistoryTargetSignature(target);
  return (
    targetSignature !== null &&
    createStudioRecorderHistoryTargetSignature(session.target) ===
      targetSignature
  );
}

export function filterStudioRecorderSessionsForTarget(
  sessions: StudioRecordingSession[],
  target: StudioRecorderTarget | null,
) {
  return sessions.filter((session) =>
    isStudioRecorderSessionForTarget(session, target),
  );
}

export function selectStudioRecorderTarget(
  studioPlayground: StudioPlaygroundContextValue,
): StudioRecorderTarget | null {
  if (studioPlayground.phase !== 'ready') {
    return null;
  }

  return resolveStudioRecorderTarget(
    studioPlayground.controller.state.runtimeInfo,
    studioPlayground.controller.state.formValues,
  );
}

export function canStartStudioRecording(
  studioPlayground: StudioPlaygroundContextValue,
  target: StudioRecorderTarget | null,
): boolean {
  return (
    studioPlayground.phase === 'ready' &&
    studioPlayground.controller.state.serverOnline &&
    studioPlayground.controller.state.sessionViewState.connected &&
    target !== null
  );
}
