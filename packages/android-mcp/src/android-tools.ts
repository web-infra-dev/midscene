import { type AndroidAgent, agentFromAdbDevice } from '@midscene/android';
import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  type BaseAgent,
  BaseMidsceneTools,
  type ToolDefinition,
  defaultAppLoadingCheckIntervalMs,
  defaultAppLoadingTimeoutMs,
} from '@midscene/shared/mcp';

const debug = getDebug('mcp:android-tools');

/**
 * Android-specific tools manager
 * Extends BaseMidsceneTools to provide Android ADB device connection tools
 */
export class AndroidMidsceneTools extends BaseMidsceneTools {
  protected createTemporaryDevice() {
    // Use require to avoid circular dependency with @midscene/android
    const { AndroidDevice } = require('@midscene/android');
    // Create minimal temporary instance without connecting to device
    // The constructor doesn't establish ADB connection
    return new AndroidDevice('temp-for-action-space', {});
  }

  protected async ensureAgent(deviceId?: string): Promise<AndroidAgent> {
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
      return this.agent as unknown as AndroidAgent;
    }

    debug('Creating Android agent with deviceId:', deviceId || 'auto-detect');
    const agent = await agentFromAdbDevice(deviceId);
    this.agent = agent as unknown as BaseAgent;
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
          'Connect to Android device and optionally launch an app. If deviceId not provided, uses the first available device.',
        schema: {
          deviceId: z
            .string()
            .optional()
            .describe('Android device ID (from adb devices)'),
          uri: z
            .string()
            .optional()
            .describe(
              'Optional URI to launch app (e.g., market://details?id=com.example.app)',
            ),
        },
        handler: async ({
          deviceId,
          uri,
        }: {
          deviceId?: string;
          uri?: string;
        }) => {
          const agent = await this.ensureAgent(deviceId);

          // If URI is provided, launch the app
          if (uri) {
            await agent.page.launch(uri);

            // Wait for app to finish loading using AI-driven polling
            await agent.aiWaitFor(
              'the app has finished loading and is ready to use',
              {
                timeoutMs: defaultAppLoadingTimeoutMs,
                checkIntervalMs: defaultAppLoadingCheckIntervalMs,
              },
            );
          }

          const screenshot = await agent.page.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to Android device${deviceId ? `: ${deviceId}` : ' (auto-detected)'}${uri ? ` and launched: ${uri} (app ready)` : ''}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
            isError: false,
          };
        },
        autoDestroy: false, // Keep agent alive for subsequent operations
      },
    ];
  }
}
