import type {
  PlaygroundRuntimeInfo,
  PlaygroundSessionTarget,
} from '@midscene/playground';
import type {
  StudioAndroidDeviceItem,
  StudioSidebarDeviceBuckets,
  StudioSidebarPlatformKey,
} from './types';

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function createEmptySidebarDeviceBuckets(): StudioSidebarDeviceBuckets {
  return {
    android: [],
    ios: [],
    computer: [],
    harmony: [],
    web: [],
  };
}

function normalizeSidebarPlatformKey(
  value: unknown,
): StudioSidebarPlatformKey | undefined {
  if (!isString(value)) {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case 'android':
      return 'android';
    case 'ios':
      return 'ios';
    case 'computer':
    case 'desktop':
    case 'macos':
    case 'windows':
    case 'linux':
      return 'computer';
    case 'harmony':
    case 'harmonyos':
    case 'harmony-os':
      return 'harmony';
    case 'web':
    case 'browser':
      return 'web';
    default:
      return undefined;
  }
}

function buildGenericConnectedDeviceItem(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  platformKey: Exclude<StudioSidebarPlatformKey, 'android'>,
): StudioAndroidDeviceItem | null {
  const metadata = runtimeInfo?.metadata || {};
  const deviceId = isString(metadata.deviceId) ? metadata.deviceId : undefined;
  const label = isString(metadata.sessionDisplayName)
    ? metadata.sessionDisplayName
    : isString(runtimeInfo?.title)
      ? runtimeInfo.title
      : deviceId;

  if (!label) {
    return null;
  }

  return {
    id: deviceId || `${platformKey}-connected`,
    label,
    description: deviceId && deviceId !== label ? deviceId : undefined,
    selected: true,
    status: 'active',
  };
}

export function resolveConnectedAndroidDeviceId(
  runtimeInfo: PlaygroundRuntimeInfo | null,
): string | undefined {
  return isString(runtimeInfo?.metadata?.deviceId)
    ? runtimeInfo.metadata.deviceId
    : undefined;
}

export function resolveSelectedAndroidDeviceId(
  formValues: Record<string, unknown>,
): string | undefined {
  return isString(formValues.deviceId) ? formValues.deviceId : undefined;
}

export function buildAndroidDeviceItems({
  formValues,
  runtimeInfo,
  targets,
}: {
  formValues: Record<string, unknown>;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  targets: PlaygroundSessionTarget[];
}): StudioAndroidDeviceItem[] {
  const connectedDeviceId = resolveConnectedAndroidDeviceId(runtimeInfo);
  const selectedDeviceId = resolveSelectedAndroidDeviceId(formValues);

  if (targets.length === 0 && connectedDeviceId) {
    return [
      {
        id: connectedDeviceId,
        label: isString(runtimeInfo?.metadata?.sessionDisplayName)
          ? runtimeInfo.metadata.sessionDisplayName
          : connectedDeviceId,
        selected: true,
        status: 'active',
      },
    ];
  }

  return targets.map((target) => ({
    id: target.id,
    label: target.label,
    description: target.description,
    selected:
      target.id === connectedDeviceId ||
      (!connectedDeviceId && target.id === selectedDeviceId),
    status: target.id === connectedDeviceId ? 'active' : 'idle',
  }));
}

export function buildStudioSidebarDeviceBuckets({
  formValues,
  runtimeInfo,
  targets,
}: {
  formValues: Record<string, unknown>;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  targets: PlaygroundSessionTarget[];
}): StudioSidebarDeviceBuckets {
  const deviceBuckets = createEmptySidebarDeviceBuckets();
  const runtimePlatformKey = normalizeSidebarPlatformKey(
    runtimeInfo?.platformId ?? runtimeInfo?.interface?.type,
  );

  if (
    runtimePlatformKey === 'android' ||
    (runtimePlatformKey === undefined &&
      (targets.length > 0 || resolveConnectedAndroidDeviceId(runtimeInfo)))
  ) {
    deviceBuckets.android = buildAndroidDeviceItems({
      formValues,
      runtimeInfo,
      targets,
    });
    return deviceBuckets;
  }

  if (runtimePlatformKey && runtimeInfo !== null) {
    const connectedItem = buildGenericConnectedDeviceItem(
      runtimeInfo,
      runtimePlatformKey,
    );

    if (connectedItem) {
      deviceBuckets[runtimePlatformKey] = [connectedItem];
    }
  }

  return deviceBuckets;
}

export function resolveVisibleSidebarPlatforms(
  deviceBuckets: StudioSidebarDeviceBuckets,
): StudioSidebarPlatformKey[] {
  return (
    Object.entries(deviceBuckets) as Array<
      [StudioSidebarPlatformKey, StudioAndroidDeviceItem[]]
    >
  )
    .filter(([, devices]) => devices.length > 0)
    .map(([platformKey]) => platformKey);
}

export function resolveAndroidDeviceLabel(
  items: StudioAndroidDeviceItem[],
): string {
  const currentDevice =
    items.find((item) => item.status === 'active') ||
    items.find((item) => item.selected);

  return currentDevice?.label ?? 'No Android device selected';
}
