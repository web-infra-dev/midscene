import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type ToolDefinition,
  createNamespacedInitArgSchema,
  extractNamespacedArgs,
  sanitizeNamespacedArgs,
} from '@midscene/shared/mcp';
import { type AndroidAgent, agentFromAdbDevice } from './agent';
import { AndroidDevice } from './device';

const debug = getDebug('mcp:android-tools');
const ANDROID_INIT_ARG_KEYS = ['deviceId'] as const;
type AndroidInitArgs = { deviceId?: string };
const androidInitArgShape = {
  deviceId: z
    .string()
    .optional()
    .describe('Android device ID (from adb devices)'),
};

function getDeviceIdFromArgs(
  args: Record<string, unknown>,
): string | undefined {
  return extractNamespacedArgs<
    (typeof ANDROID_INIT_ARG_KEYS)[number],
    AndroidInitArgs
  >(args, 'android', ANDROID_INIT_ARG_KEYS)?.deviceId;
}

/**
 * Android-specific tools manager
 * Extends BaseMidsceneTools to provide Android ADB device connection tools
 */
export class AndroidMidsceneTools extends BaseMidsceneTools<AndroidAgent> {
  protected createTemporaryDevice() {
    // Create minimal temporary instance without connecting to device
    // The constructor doesn't establish ADB connection
    return new AndroidDevice('temp-for-action-space', {});
  }

  protected extractAgentInitParam(args: Record<string, unknown>): unknown {
    return getDeviceIdFromArgs(args);
  }

  protected sanitizeToolArgs(
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    return sanitizeNamespacedArgs(args, 'android', ANDROID_INIT_ARG_KEYS);
  }

  protected getAgentInitArgSchema() {
    return createNamespacedInitArgSchema('android', androidInitArgShape);
  }

  protected async ensureAgent(initParam?: unknown): Promise<AndroidAgent> {
    const deviceId = typeof initParam === 'string' ? initParam : undefined;

    if (this.agent && deviceId) {
      // If a specific deviceId is requested and we have an agent,
      // destroy it to create a new one with the new device
      try {
        await this.agent.destroy?.();
      } catch (error) {
        debug('Failed to destroy agent during cleanup:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) {
      return this.agent;
    }

    debug('Creating Android agent with deviceId:', deviceId || 'auto-detect');
    const agent = await agentFromAdbDevice(deviceId, {
      autoDismissKeyboard: false,
    });
    this.agent = agent;
    return agent;
  }

  /**
   * Provide Android-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'android_connect',
        description:
          'Connect to Android device via ADB. If deviceId not provided, uses the first available device.',
        schema: this.getAgentInitArgSchema(),
        handler: async (args: Record<string, unknown>) => {
          const deviceId = getDeviceIdFromArgs(args);
          const agent = await this.ensureAgent(deviceId);
          const screenshot = await agent.page.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to Android device${deviceId ? `: ${deviceId}` : ' (auto-detected)'}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
            isError: false,
          };
        },
      },
      {
        name: 'android_disconnect',
        description:
          'Disconnect from current Android device and release ADB resources',
        schema: {},
        handler: this.createDisconnectHandler('Android device'),
      },
    ];
  }
}
