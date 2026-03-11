import {
  createSessionAgentOptions,
  exportSessionReport,
  z,
} from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { type AndroidAgent, agentFromAdbDevice } from './agent';
import { AndroidDevice } from './device';

const debug = getDebug('mcp:android-tools');

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
      return this.agent;
    }

    debug('Creating Android agent with deviceId:', deviceId || 'auto-detect');
    const sessionOptions = createSessionAgentOptions({
      sessionId: this.getInvocationStringArg('sessionId'),
      platform: 'android',
      commandId: this.getInvocationCommandId(),
      commandName: this.getInvocationCommandName(),
    });
    const agent = await agentFromAdbDevice(deviceId, {
      autoDismissKeyboard: false,
      ...sessionOptions,
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
        schema: {
          deviceId: z
            .string()
            .optional()
            .describe('Android device ID (from adb devices)'),
        },
        handler: async (args: { deviceId?: string; sessionId?: string }) =>
          this.runWithInvocationContext(
            { ...args, __commandName: 'android_connect' },
            async () => {
              const agent = await this.ensureAgent(args.deviceId);
              const screenshot = await agent.page.screenshotBase64();

              return {
                content: [
                  {
                    type: 'text',
                    text: `Connected to Android device${args.deviceId ? `: ${args.deviceId}` : ' (auto-detected)'}`,
                  },
                  ...this.buildScreenshotContent(screenshot),
                ],
                isError: false,
              };
            },
          ),
      },
      {
        name: 'android_disconnect',
        description:
          'Disconnect from current Android device and release ADB resources',
        schema: {},
        handler: this.createDisconnectHandler('Android device'),
      },
      {
        name: 'android_export_session_report',
        description:
          'Generate a merged HTML report from a persisted Android session',
        schema: {
          sessionId: z.string().describe('Persistent session ID to export'),
        },
        handler: async (args: Record<string, unknown>) => {
          const sessionId = args.sessionId;
          if (typeof sessionId !== 'string' || !sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'sessionId is required to export a session report',
                },
              ],
              isError: true,
            };
          }
          const reportPath = exportSessionReport(sessionId);
          return this.buildTextResult(
            `Session report generated: ${reportPath}`,
          );
        },
      },
    ];
  }
}
