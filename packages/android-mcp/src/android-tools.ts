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
  protected getDefaultActionSpace() {
    // Provide default Android action space when device is not connected
    return [
      { name: 'Tap', description: 'Tap the element' },
      { name: 'DoubleClick', description: 'Double click the element' },
      { name: 'Input', description: 'Input text into the input field' },
      { name: 'Scroll', description: 'Scroll the page or an element' },
      { name: 'DragAndDrop', description: 'Drag and drop the element' },
      { name: 'KeyboardPress', description: 'Press a key or key combination' },
      { name: 'AndroidLongPress', description: 'Trigger a long press on the screen at specified coordinates on Android devices' },
      { name: 'AndroidPull', description: 'Trigger pull down to refresh or pull up actions' },
      { name: 'ClearInput', description: 'Clear the input field' },
      { name: 'RunAdbShell', description: 'Execute ADB shell command on Android device' },
      { name: 'Launch', description: 'Launch an Android app or URL' },
      { name: 'AndroidBackButton', description: 'Trigger the system "back" operation on Android devices' },
      { name: 'AndroidHomeButton', description: 'Trigger the system "home" operation on Android devices' },
      { name: 'AndroidRecentAppsButton', description: 'Trigger the system "recent apps" operation on Android devices' },
    ];
  }

  protected createTemporaryDevice() {
    // Import AndroidDevice class
    const { AndroidDevice } = require('@midscene/android');
    // Create minimal temporary instance without connecting to device
    // The constructor doesn't establish ADB connection
    return new AndroidDevice('temp-for-actionspace', {});
  }

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

            // Wait for app to finish loading using AI-driven polling
            await agent.aiWaitFor(
              'the app has finished loading and is ready to use',
              {
                timeoutMs: 10000,
                checkIntervalMs: 2000,
              },
            );
          }

          const screenshot = await agent.page.screenshotBase64();
          const { mimeType, body } = parseBase64(screenshot);

          return {
            content: [
              {
                type: 'text',
                text: `Connected to Android device${deviceId ? `: ${deviceId}` : ' (auto-detected)'}${uri ? ` and launched: ${uri} (app ready)` : ''}`,
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
