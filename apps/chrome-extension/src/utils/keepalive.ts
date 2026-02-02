/**
 * Service Worker Keepalive Module
 *
 * Manages the chrome.alarms-based keepalive mechanism to prevent
 * the Service Worker from being suspended during bridge activity.
 */

const KEEPALIVE_ALARM_NAME = 'midscene-bridge-keepalive';
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds (must be >= 0.4 in Chrome)
const MAX_STORAGE_RETRY_COUNT = 10;
const STORAGE_RETRY_INTERVAL_MS = 100;

const isDevelopment = process.env.NODE_ENV === 'development';

/** Internal state tracking */
let isEnabled = false;
let storageRetryCount = 0;

/** Clears any existing keepalive alarm */
async function clearAlarm(): Promise<void> {
  await chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
}

/** Creates a new keepalive alarm */
async function createAlarm(): Promise<void> {
  await chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
  });
}

/** Checks if chrome.storage is available */
function isStorageReady(): boolean {
  return !!chrome?.storage?.local;
}

/**
 * Determines if keepalive should be enabled based on storage config
 * @param storageKey - The storage key to check for auto-connect config
 * @param currentBridgeStatus - Current bridge connection status
 */
async function shouldEnableFromConfig(
  storageKey: string,
  currentBridgeStatus: string,
): Promise<boolean> {
  const result = await chrome.storage.local.get(storageKey);
  const autoConnect = result[storageKey];
  return (
    autoConnect?.enabled ||
    currentBridgeStatus === 'connected' ||
    currentBridgeStatus === 'listening'
  );
}

export interface KeepaliveSetupOptions {
  /** Explicit enable/disable. If undefined, will check storage config */
  shouldEnable?: boolean;
  /** Storage key for auto-connect config */
  storageKey: string;
  /** Current bridge status for determining if keepalive is needed */
  currentBridgeStatus: string;
}

/**
 * Sets up or tears down the keepalive alarm based on bridge state
 */
export async function setupKeepalive(
  options: KeepaliveSetupOptions,
): Promise<void> {
  const { shouldEnable, storageKey, currentBridgeStatus } = options;

  // Wait for chrome.storage to be available with retry limit
  if (!isStorageReady()) {
    if (storageRetryCount >= MAX_STORAGE_RETRY_COUNT) {
      console.error(
        '[Keepalive] chrome.storage not available after max retries',
      );
      storageRetryCount = 0;
      return;
    }
    storageRetryCount++;
    console.log(
      `[Keepalive] chrome.storage not ready, retry ${storageRetryCount}/${MAX_STORAGE_RETRY_COUNT}...`,
    );
    setTimeout(() => setupKeepalive(options), STORAGE_RETRY_INTERVAL_MS);
    return;
  }

  // Reset retry count on successful storage access
  storageRetryCount = 0;

  try {
    // Clear any existing alarm first
    await clearAlarm();

    // Determine if keepalive should be enabled
    const enabled =
      shouldEnable ??
      (await shouldEnableFromConfig(storageKey, currentBridgeStatus));

    if (enabled) {
      await createAlarm();
      if (!isEnabled) {
        console.log('[Keepalive] Alarm set');
      }
      isEnabled = true;
    } else {
      if (isEnabled) {
        console.log('[Keepalive] Alarm cleared');
      }
      isEnabled = false;
    }
  } catch (error) {
    console.error('[Keepalive] Failed to setup:', error);
  }
}

/**
 * Safely calls setupKeepalive with error handling
 * Use this for fire-and-forget scenarios
 */
export function safeSetupKeepalive(options: KeepaliveSetupOptions): void {
  void setupKeepalive(options).catch((error) => {
    console.error('[Keepalive] Setup failed:', error);
  });
}

/**
 * Registers the alarm listener for keepalive pings
 */
export function registerAlarmListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM_NAME) {
      // Just accessing chrome APIs keeps the SW alive
      if (isDevelopment) {
        console.log('[Keepalive] Ping -', new Date().toLocaleTimeString());
      }
    }
  });
}

/**
 * Returns current keepalive enabled state
 */
export function isKeepaliveEnabled(): boolean {
  return isEnabled;
}
