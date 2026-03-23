import { randomUUID } from 'node:crypto';
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices as getAndroidDevices,
} from '@midscene/android';
import {
  agentFromComputer,
  checkAccessibilityPermission,
} from '@midscene/computer';
import {
  HarmonyAgent,
  HarmonyDevice,
  getConnectedDevices as getHarmonyDevices,
} from '@midscene/harmony';
import { IOSAgent, IOSDevice } from '@midscene/ios';
import {
  createMjpegPreviewDescriptor,
  createScreenshotPreviewDescriptor,
  launchPreparedPlaygroundPlatform,
} from '@midscene/playground';

const DEFAULT_IOS_HOST = 'localhost';
const DEFAULT_IOS_PORT = 8100;

const PLATFORM_DEFINITIONS = [
  {
    id: 'android',
    title: 'Android',
    description: 'Create a session for an Android device connected over ADB.',
    fields: [
      {
        name: 'deviceId',
        label: 'Device ID',
        type: 'text',
        placeholder:
          'Leave empty to auto-select when exactly one device is connected.',
      },
    ],
  },
  {
    id: 'ios',
    title: 'iOS',
    description:
      'Create a session for an iOS target exposed through WebDriverAgent.',
    fields: [
      {
        name: 'host',
        label: 'WDA Host',
        type: 'text',
        placeholder: DEFAULT_IOS_HOST,
        defaultValue: DEFAULT_IOS_HOST,
      },
      {
        name: 'port',
        label: 'WDA Port',
        type: 'number',
        defaultValue: DEFAULT_IOS_PORT,
      },
    ],
  },
  {
    id: 'computer',
    title: 'Computer',
    description: 'Create a desktop automation session for the current machine.',
    fields: [],
  },
  {
    id: 'harmony',
    title: 'HarmonyOS',
    description: 'Create a session for a HarmonyOS device connected over HDC.',
    fields: [
      {
        name: 'deviceId',
        label: 'Device ID',
        type: 'text',
        placeholder:
          'Leave empty to auto-select when exactly one device is connected.',
      },
    ],
  },
];

function cleanString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePort(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return DEFAULT_IOS_PORT;
}

async function resolveAndroidDeviceId(deviceId) {
  const devices = (await getAndroidDevices()).filter(
    (device) => device.state === 'device',
  );

  const providedDeviceId = cleanString(deviceId);
  if (providedDeviceId) {
    return providedDeviceId;
  }

  if (devices.length === 1) {
    return devices[0].udid;
  }

  if (devices.length === 0) {
    throw new Error(
      'No Android devices found. Connect a device and enable USB debugging before creating a session.',
    );
  }

  throw new Error(
    `Multiple Android devices found. Please enter a device ID explicitly: ${devices
      .map((device) => device.udid)
      .join(', ')}`,
  );
}

async function resolveHarmonyDeviceId(deviceId) {
  const devices = await getHarmonyDevices();
  const providedDeviceId = cleanString(deviceId);
  if (providedDeviceId) {
    return providedDeviceId;
  }

  if (devices.length === 1) {
    return devices[0].deviceId;
  }

  if (devices.length === 0) {
    throw new Error(
      'No HarmonyOS devices found. Connect a device and verify `hdc list targets` works before creating a session.',
    );
  }

  throw new Error(
    `Multiple HarmonyOS devices found. Please enter a device ID explicitly: ${devices
      .map((device) => device.deviceId)
      .join(', ')}`,
  );
}

async function createPreparedSession(platformId, options, windowProvider) {
  switch (platformId) {
    case 'android': {
      const deviceId = await resolveAndroidDeviceId(options?.deviceId);
      return {
        platformId,
        title: 'Midscene Android Session',
        agentFactory: async () => {
          const device = new AndroidDevice(deviceId);
          await device.connect();
          return new AndroidAgent(device);
        },
        preview: createScreenshotPreviewDescriptor({
          title: 'Android device preview',
        }),
        metadata: {
          deviceId,
        },
        launchOptions: {
          openBrowser: false,
          verbose: false,
        },
      };
    }
    case 'ios': {
      const host = cleanString(options?.host) || DEFAULT_IOS_HOST;
      const port = parsePort(options?.port);
      const initialDevice = new IOSDevice({
        wdaHost: host,
        wdaPort: port,
      });
      await initialDevice.connect();
      await initialDevice.destroy?.();
      return {
        platformId,
        title: 'Midscene iOS Session',
        agentFactory: async () => {
          const device = new IOSDevice({
            wdaHost: host,
            wdaPort: port,
          });
          await device.connect();
          return new IOSAgent(device);
        },
        preview: createMjpegPreviewDescriptor({
          title: 'iOS device preview',
        }),
        metadata: {
          wdaHost: host,
          wdaPort: port,
        },
        launchOptions: {
          openBrowser: false,
          verbose: false,
        },
      };
    }
    case 'computer': {
      const accessibilityCheck = checkAccessibilityPermission(true);
      if (!accessibilityCheck.hasPermission) {
        throw new Error(
          accessibilityCheck.error || 'Accessibility permission is required.',
        );
      }

      return {
        platformId,
        title: 'Midscene Computer Session',
        agentFactory: agentFromComputer,
        preview: createScreenshotPreviewDescriptor({
          title: 'Desktop preview',
        }),
        metadata: {
          executionUx: 'countdown-before-run',
        },
        launchOptions: {
          openBrowser: false,
          verbose: false,
          configureServer(server) {
            server.app.use('/execute', async (_req, res, next) => {
              const activeWindow = windowProvider();
              if (!activeWindow) {
                next();
                return;
              }

              await new Promise((resolve) => setTimeout(resolve, 1500));
              activeWindow.minimize();

              const originalSend = res.send.bind(res);
              res.send = (body) => {
                if (!activeWindow.isDestroyed()) {
                  activeWindow.restore();
                  activeWindow.focus();
                }
                return originalSend(body);
              };

              next();
            });
          },
        },
      };
    }
    case 'harmony': {
      const deviceId = await resolveHarmonyDeviceId(options?.deviceId);
      return {
        platformId,
        title: 'Midscene HarmonyOS Session',
        agentFactory: async () => {
          const device = new HarmonyDevice(deviceId);
          await device.connect();
          return new HarmonyAgent(device);
        },
        preview: createScreenshotPreviewDescriptor({
          title: 'HarmonyOS device preview',
        }),
        metadata: {
          deviceId,
        },
        launchOptions: {
          openBrowser: false,
          verbose: false,
        },
      };
    }
    default:
      throw new Error(`Unsupported platform: ${platformId}`);
  }
}

export function createSessionManager(windowProvider) {
  const sessions = new Map();

  return {
    getPlatforms() {
      return PLATFORM_DEFINITIONS;
    },
    listSessions() {
      return Array.from(sessions.values()).map(
        ({ cleanup, ...session }) => session,
      );
    },
    async createSession(payload) {
      const platformId = cleanString(payload?.platformId);
      if (!platformId) {
        throw new Error('platformId is required');
      }

      const prepared = await createPreparedSession(
        platformId,
        payload?.options || {},
        windowProvider,
      );
      const launched = await launchPreparedPlaygroundPlatform(prepared);
      const summary = {
        id: randomUUID(),
        platformId: prepared.platformId,
        title: prepared.title,
        createdAt: new Date().toISOString(),
        serverId: launched.server.id,
        serverUrl: `http://${launched.host}:${launched.port}`,
        runtimeInfo: launched.server.getRuntimeInfo(),
      };

      sessions.set(summary.id, {
        ...summary,
        cleanup: async () => {
          await launched.close();
        },
      });

      return summary;
    },
    async stopSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return false;
      }

      await session.cleanup();
      sessions.delete(sessionId);
      return true;
    },
    async dispose() {
      const entries = Array.from(sessions.entries());
      for (const [sessionId, session] of entries) {
        await session.cleanup();
        sessions.delete(sessionId);
      }
    },
  };
}
