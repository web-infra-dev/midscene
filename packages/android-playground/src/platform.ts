import path from 'node:path';
import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevicesWithDetails,
} from '@midscene/android';
import {
  type PlaygroundSessionManager,
  type PlaygroundSessionTarget,
  createScrcpyPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import type ScrcpyServer from './scrcpy-server';

export interface AndroidPlatformOptions {
  staticDir?: string;
  scrcpyServer?: ScrcpyServer;
  scrcpyPort?: number;
}

async function getAdbTargets(): Promise<PlaygroundSessionTarget[]> {
  const devices = await getConnectedDevicesWithDetails();
  return devices
    .filter((device) => device.state === 'device')
    .map((device, index) => ({
      id: device.udid,
      label: device.udid,
      description:
        [device.model, device.resolution].filter(Boolean).join(' · ') ||
        device.state,
      status: device.state,
      isDefault: index === 0,
    }));
}

interface AdbTargetsResult {
  targets: PlaygroundSessionTarget[];
  error?: string;
}

async function getAdbTargetsSafe(): Promise<AdbTargetsResult> {
  try {
    return { targets: await getAdbTargets() };
  } catch (error) {
    return {
      targets: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const androidPlaygroundPlatform = definePlaygroundPlatform<
  AndroidPlatformOptions | undefined
>({
  id: 'android',
  title: 'Midscene Android Playground',
  description: 'Android playground platform descriptor',
  async prepare(options) {
    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const [playgroundPort, resolvedScrcpyPort] = await Promise.all([
      findAvailablePort(PLAYGROUND_SERVER_PORT),
      options?.scrcpyPort
        ? Promise.resolve(options.scrcpyPort)
        : findAvailablePort(SCRCPY_SERVER_PORT),
    ]);
    const scrcpyPort = resolvedScrcpyPort;

    if (playgroundPort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${playgroundPort} instead`,
      );
    }
    if (scrcpyPort !== SCRCPY_SERVER_PORT) {
      console.log(
        `⚠️  Port ${SCRCPY_SERVER_PORT} is busy, using port ${scrcpyPort} instead`,
      );
    }

    const baseDescription =
      'Select an available ADB device to create the current Android Agent';

    const sessionManager: PlaygroundSessionManager = {
      async getSetupSchema() {
        const { targets, error } = await getAdbTargetsSafe();
        const description = error
          ? `${baseDescription}\n\n⚠️ ${error}`
          : baseDescription;
        return {
          title: 'Welcome to\nMidscene.js Playground!',
          description,
          primaryActionLabel: 'Create Agent',
          autoSubmitWhenReady: targets.length === 1,
          fields: [
            {
              key: 'deviceId',
              label: 'ADB device',
              type: 'select',
              required: true,
              options: targets.map((target) => ({
                label: target.label,
                value: target.id,
                description: target.description,
              })),
              defaultValue: targets.find((target) => target.isDefault)?.id,
              placeholder: 'Select a connected Android device',
            },
          ],
          targets,
        };
      },
      listTargets: async () => (await getAdbTargetsSafe()).targets,
      async createSession(input) {
        const targets = await getAdbTargets();
        const deviceId =
          typeof input?.deviceId === 'string' && input.deviceId
            ? input.deviceId
            : targets.find((target) => target.isDefault)?.id;

        if (!deviceId) {
          throw new Error(
            'No Android devices found. Connect a device with USB debugging enabled and try again.',
          );
        }

        const connectAgent = async () => {
          const device = new AndroidDevice(deviceId);
          await device.connect();
          return new AndroidAgent(device);
        };

        if (options?.scrcpyServer) {
          options.scrcpyServer.currentDeviceId = deviceId;
        }

        const agent = await connectAgent();

        return {
          agent,
          agentFactory: connectAgent,
          preview: createScrcpyPreviewDescriptor(
            { scrcpyPort },
            { title: 'Android device preview' },
          ),
          displayName: deviceId,
          metadata: {
            deviceId,
            scrcpyPort,
          },
        };
      },
    };

    return {
      platformId: 'android',
      title: 'Midscene Android Playground',
      sessionManager,
      sidecars: options?.scrcpyServer
        ? [
            {
              id: 'android-scrcpy',
              start: async () => {
                await options.scrcpyServer?.launch(scrcpyPort);
              },
              stop: async () => {
                options.scrcpyServer?.close();
              },
            },
          ]
        : undefined,
      launchOptions: {
        port: playgroundPort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
        configureServer(server) {
          server.scrcpyPort = scrcpyPort;
        },
      },
      preview: createScrcpyPreviewDescriptor(
        {
          scrcpyPort,
        },
        {
          title: 'Android device preview',
        },
      ),
      metadata: {
        scrcpyPort,
        sessionConnected: false,
        setupState: 'required',
      },
    };
  },
});
