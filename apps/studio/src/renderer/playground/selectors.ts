import type {
  PlaygroundRuntimeInfo,
  PlaygroundSessionTarget,
} from '@midscene/playground';
import type { DiscoveredDevice } from '@shared/electron-contract';
import { STUDIO_PLATFORM_IDS } from '@shared/electron-contract';
import type {
  DiscoveredDevicesByPlatform,
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

/**
 * Platforms use different metadata keys for the device id:
 *   Android / Harmony → metadata.deviceId
 *   Computer          → metadata.displayId
 */
function resolveConnectedDeviceId(
  runtimeInfo: PlaygroundRuntimeInfo | null,
): string | undefined {
  const metadata = runtimeInfo?.metadata || {};
  if (isString(metadata.deviceId)) {
    return metadata.deviceId;
  }
  if (isString(metadata.displayId)) {
    return metadata.displayId;
  }
  return undefined;
}

/**
 * Human-readable label for whatever device the playground is currently
 * connected to, across platforms. Prefers the session display name, then
 * falls back to a concrete device id, then to the platform title, and
 * finally to `emptyLabel` when nothing is connected.
 */
export function resolveConnectedDeviceLabel(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  options: { emptyLabel: string },
): string {
  const metadata = runtimeInfo?.metadata || {};
  if (isString(metadata.sessionDisplayName)) {
    return metadata.sessionDisplayName;
  }
  const deviceId = resolveConnectedDeviceId(runtimeInfo);
  if (deviceId) {
    // "Display 1" reads better than a bare numeric id for computer.
    return isString(metadata.displayId) && !isString(metadata.deviceId)
      ? `Display ${deviceId}`
      : deviceId;
  }
  if (isString(runtimeInfo?.title)) {
    return runtimeInfo.title;
  }
  return options.emptyLabel;
}

function buildGenericConnectedDeviceItem(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  platformKey: Exclude<StudioSidebarPlatformKey, 'android'>,
): StudioAndroidDeviceItem | null {
  const metadata = runtimeInfo?.metadata || {};
  const deviceId = resolveConnectedDeviceId(runtimeInfo);
  const label = isString(metadata.sessionDisplayName)
    ? metadata.sessionDisplayName
    : deviceId ||
      (isString(runtimeInfo?.title) ? runtimeInfo.title : undefined);

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

/**
 * Bucket a flat discovery result by platform, driven off the canonical
 * platform id set so a new platform can't be silently dropped.
 */
export function bucketDiscoveredDevices(
  devices: DiscoveredDevice[],
): DiscoveredDevicesByPlatform {
  const buckets = Object.fromEntries(
    STUDIO_PLATFORM_IDS.map((key) => [key, [] as DiscoveredDevice[]]),
  ) as DiscoveredDevicesByPlatform;
  for (const device of devices) {
    const bucket = buckets[device.platformId];
    if (bucket) {
      bucket.push(device);
    }
  }
  return buckets;
}

/**
 * Platforms that expose a real-time discovery source (ADB / HDC /
 * display enumeration) in the main process. For these, discovery is
 * the authoritative "physically present" list — once it has polled at
 * least once, a session item that isn't discovered anymore is stale
 * (e.g. the user unplugged the device while a session was still open).
 */
const DISCOVERABLE_PLATFORMS = ['android', 'harmony', 'computer'] as const;

/**
 * Merge session-setup buckets with the live discovery snapshot. For
 * discoverable platforms, discovery wins — items not present in the
 * discovery snapshot are dropped (catches unplug while connected), and
 * items only present in discovery are appended as idle entries.
 *
 * iOS (and web) have no discovery source, so `sessionBuckets` is
 * passed through unchanged.
 *
 * If `discovered` is undefined (first poll hasn't landed yet), the
 * session buckets are returned as-is rather than being wiped out.
 */
export function mergeSidebarDeviceBucketsWithDiscovery(
  sessionBuckets: StudioSidebarDeviceBuckets,
  discovered: DiscoveredDevicesByPlatform | undefined,
): StudioSidebarDeviceBuckets {
  if (!discovered) {
    return sessionBuckets;
  }

  const merged: StudioSidebarDeviceBuckets = { ...sessionBuckets };

  for (const key of DISCOVERABLE_PLATFORMS) {
    const discoveredBucket = discovered[key];
    const discoveredIds = new Set(discoveredBucket.map((d) => d.id));

    // Drop any session items whose id is not physically present anymore.
    const survivingSessionItems = sessionBuckets[key].filter((item) =>
      discoveredIds.has(item.id),
    );
    const survivingIds = new Set(survivingSessionItems.map((item) => item.id));

    // Append discovered devices that aren't already covered by the
    // session bucket (those already carry label/selected/active metadata).
    const additions: StudioAndroidDeviceItem[] = [];
    for (const dev of discoveredBucket) {
      if (!survivingIds.has(dev.id)) {
        additions.push({
          id: dev.id,
          label: dev.label,
          description: dev.description,
          selected: false,
          status: 'idle',
        });
      }
    }

    merged[key] = [...survivingSessionItems, ...additions];
  }

  return merged;
}

export function resolveAndroidDeviceLabel(
  items: StudioAndroidDeviceItem[],
): string {
  const currentDevice =
    items.find((item) => item.status === 'active') ||
    items.find((item) => item.selected);

  return currentDevice?.label ?? 'No Android device selected';
}
