import { type AndroidAgent, agentFromAdbDevice } from '@midscene/android';
import { z } from '@midscene/core';
import { parseBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';

const debug = getDebug('mcp:android-tools');

/**
 * Android-specific tools manager
 * Extends BaseMidsceneTools to provide Android ADB device connection tools
 */
export class AndroidMidsceneTools extends BaseMidsceneTools {
  protected async ensureAgent(deviceId?: string): Promise<AndroidAgent> {
    if (this.agent && deviceId) {
      // If a specific deviceId is requested and we have an agent,
      // destroy it to create a new one with the new device
      try {
        await this.agent.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.agent = undefined;
    }

    if (this.agent) {
      return this.agent;
    }

    debug('Creating Android agent with deviceId:', deviceId || 'auto-detect');
    this.agent = await agentFromAdbDevice(deviceId);
    return this.agent;
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
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for app to launch
          }

          const screenshot = await agent.page.screenshotBase64();
          const { mimeType, body } = parseBase64(screenshot);

          return {
            content: [
              {
                type: 'text',
                text: `Connected to Android device${deviceId ? `: ${deviceId}` : ' (auto-detected)'}${uri ? ` and launched: ${uri}` : ''}`,
              },
              {
                type: 'image',
                data: body,
                mimeType,
              },
            ],
            isError: false,
          };
        },
        autoDestroy: false, // Keep agent alive for subsequent operations
      },
    ];
  }
}
