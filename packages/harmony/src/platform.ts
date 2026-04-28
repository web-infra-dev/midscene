import path from 'node:path';
import { select } from '@inquirer/prompts';
import {
  type PlaygroundSessionManager,
  type PlaygroundSessionTarget,
  createScreenshotPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import { HarmonyAgent } from './agent';
import { HarmonyDevice } from './device';
import { getConnectedDevices } from './utils';

export interface HarmonyPlatformOptions {
  deferConnection?: boolean;
  deviceId?: string;
  staticDir?: string;
}

const HARMONY_NO_DEVICE_MESSAGE =
  'No HarmonyOS devices found. Connect a device via USB, ensure HDC is configured, and run `hdc list targets` to verify.';

function createNoDeviceError(): Error {
  return new Error(HARMONY_NO_DEVICE_MESSAGE);
}

async function getHdcTargets(): Promise<PlaygroundSessionTarget[]> {
  const devices = await getConnectedDevices();
  return devices.map((device, index) => ({
    id: device.deviceId,
    label: device.deviceId,
    isDefault: index === 0,
    status: 'device',
  }));
}

interface HdcTargetsResult {
  targets: PlaygroundSessionTarget[];
  error?: string;
}

async function getHdcTargetsSafe(): Promise<HdcTargetsResult> {
  try {
    const targets = await getHdcTargets();
    return {
      targets,
      ...(targets.length === 0 ? { error: HARMONY_NO_DEVICE_MESSAGE } : {}),
    };
  } catch (error) {
    return {
      targets: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function selectDevice(): Promise<string> {
  console.log('🔍 Scanning for HarmonyOS devices...');
  const targets = await getHdcTargets();

  if (targets.length === 0) {
    throw createNoDeviceError();
  }

  if (targets.length === 1) {
    console.log(`📱 Found device: ${targets[0].id}`);
    return targets[0].id;
  }

  return select({
    message: '📱 Multiple devices found. Please select one:',
    choices: targets.map((target) => ({
      name: target.label,
      value: target.id,
    })),
  });
}

export const harmonyPlaygroundPlatform = definePlaygroundPlatform<
  HarmonyPlatformOptions | undefined
>({
  id: 'harmony',
  title: 'Midscene HarmonyOS Playground',
  description: 'HarmonyOS playground platform descriptor',
  async prepare(options) {
    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    const createSessionManager = (): PlaygroundSessionManager => ({
      async getSetupSchema() {
        const explicitDeviceId = options?.deviceId;
        const discovery = explicitDeviceId
          ? {
              targets: [
                {
                  id: explicitDeviceId,
                  label: explicitDeviceId,
                  isDefault: true,
                  status: 'device',
                },
              ] satisfies PlaygroundSessionTarget[],
            }
          : await getHdcTargetsSafe();
        const { error, targets } = discovery;

        return {
          title: 'Welcome to\nMidscene.js Playground!',
          description:
            'Select an available HDC device to create the current HarmonyOS Agent',
          primaryActionLabel: 'Create Agent',
          autoSubmitWhenReady: targets.length === 1,
          notice: error
            ? {
                type: 'warning',
                message: 'HarmonyOS device discovery failed',
                description: error,
              }
            : undefined,
          fields: [
            {
              key: 'deviceId',
              label: 'HDC device',
              type: 'select',
              required: true,
              options: targets.map((target) => ({
                label: target.label,
                value: target.id,
                description: target.description,
              })),
              defaultValue: targets.find((target) => target.isDefault)?.id,
              placeholder: 'Select a connected HarmonyOS device',
            },
          ],
          targets,
        };
      },
      async listTargets() {
        if (options?.deviceId) {
          return [
            {
              id: options.deviceId,
              label: options.deviceId,
              isDefault: true,
              status: 'device',
            },
          ];
        }

        return (await getHdcTargetsSafe()).targets;
      },
      async createSession(input) {
        const targets = options?.deviceId
          ? [
              {
                id: options.deviceId,
                label: options.deviceId,
                isDefault: true,
                status: 'device',
              },
            ]
          : await getHdcTargets();
        const deviceId =
          options?.deviceId ||
          (typeof input?.deviceId === 'string' && input.deviceId
            ? input.deviceId
            : targets.find((target) => target.isDefault)?.id);

        if (!deviceId) {
          throw createNoDeviceError();
        }

        const connectAgent = async () => {
          const device = new HarmonyDevice(deviceId);
          await device.connect();
          return new HarmonyAgent(device);
        };

        const agent = await connectAgent();

        return {
          agent,
          agentFactory: connectAgent,
          preview: createScreenshotPreviewDescriptor({
            title: 'HarmonyOS device preview',
          }),
          displayName: deviceId,
          metadata: {
            deviceId,
          },
        };
      },
    });

    if (options?.deferConnection) {
      return {
        platformId: 'harmony',
        title: 'Midscene HarmonyOS Playground',
        sessionManager: createSessionManager(),
        launchOptions: {
          port: availablePort,
          openBrowser: false,
          verbose: false,
          staticPath: staticDir,
        },
        preview: createScreenshotPreviewDescriptor({
          title: 'HarmonyOS device preview',
        }),
        metadata: {
          ...(options.deviceId ? { deviceId: options.deviceId } : {}),
          sessionConnected: false,
          setupState: 'required',
        },
      };
    }

    const selectedDeviceId = options?.deviceId || (await selectDevice());

    return {
      platformId: 'harmony',
      title: 'Midscene HarmonyOS Playground',
      agentFactory: async () => {
        const device = new HarmonyDevice(selectedDeviceId);
        await device.connect();
        return new HarmonyAgent(device);
      },
      launchOptions: {
        port: availablePort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
      },
      preview: createScreenshotPreviewDescriptor({
        title: 'HarmonyOS device preview',
      }),
      metadata: {
        deviceId: selectedDeviceId,
      },
    };
  },
});
