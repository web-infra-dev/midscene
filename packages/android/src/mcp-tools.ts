import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { type AndroidAgent, agentFromAdbDevice } from './agent';
import { AndroidDevice } from './device';

const debug = getDebug('mcp:android-tools');

/**
 * Android-specific tools manager
 * Extends BaseMidsceneTools to provide Android ADB device connection tools
 */
export class AndroidMidsceneTools extends BaseMidsceneTools<
  AndroidAgent,
  {
    deviceId?: string;
    useScrcpy?: boolean;
  }
> {
  protected getCliReportSessionName() {
    return 'midscene-android';
  }

  protected readonly initArgSpec: InitArgSpec<{
    deviceId?: string;
    useScrcpy?: boolean;
  }> = {
    namespace: 'android',
    shape: {
      deviceId: z
        .string()
        .optional()
        .describe('Android device ID (from adb devices)'),
      useScrcpy: z
        .boolean()
        .optional()
        .describe('Enable scrcpy accelerated screenshots'),
    },
    cli: {
      preferBareKeys: true,
    },
    adapt: (extracted) => ({
      deviceId: extracted?.deviceId as string | undefined,
      useScrcpy: extracted?.useScrcpy as boolean | undefined,
    }),
  };

  protected createTemporaryDevice() {
    // Create minimal temporary instance without connecting to device
    // The constructor doesn't establish ADB connection
    return new AndroidDevice('temp-for-action-space', {});
  }

  protected async ensureAgent(initArgs?: {
    deviceId?: string;
    useScrcpy?: boolean;
  }): Promise<AndroidAgent> {
    const deviceId = initArgs?.deviceId;
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
    const reportOptions = this.readCliReportAgentOptions();
    const agent = await agentFromAdbDevice(deviceId, {
      autoDismissKeyboard: false,
      ...(initArgs?.useScrcpy ? { scrcpyConfig: { enabled: true } } : {}),
      ...(reportOptions ?? {}),
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
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const deviceId = initArgs?.deviceId;
          const reportSession = this.createNewCliReportSession(
            deviceId ?? 'auto',
          );
          this.commitCliReportSession(reportSession);
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (error) {
              debug('Failed to destroy agent during connect:', error);
            }
            this.agent = undefined;
          }
          const agent = await this.ensureAgent(initArgs);
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
