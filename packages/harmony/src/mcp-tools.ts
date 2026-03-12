import {
  createExportSessionReportTool,
  createSessionAgentOptions,
  z,
} from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { type HarmonyAgent, agentFromHdcDevice } from './agent';
import { HarmonyDevice } from './device';

const debug = getDebug('mcp:harmony-tools');

export class HarmonyMidsceneTools extends BaseMidsceneTools<HarmonyAgent> {
  protected createTemporaryDevice() {
    return new HarmonyDevice('temp-for-action-space', {});
  }

  protected async ensureAgent(deviceId?: string): Promise<HarmonyAgent> {
    if (this.agent && deviceId) {
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

    debug('Creating Harmony agent with deviceId:', deviceId || 'auto-detect');
    const sessionOptions = createSessionAgentOptions({
      sessionId: this.getInvocationStringArg('sessionId'),
      platform: 'harmony',
    });
    const agent = await agentFromHdcDevice(deviceId, {
      autoDismissKeyboard: false,
      ...sessionOptions,
    });
    this.agent = agent;
    return agent;
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'harmony_connect',
        description:
          'Connect to HarmonyOS device via HDC. If deviceId not provided, uses the first available device.',
        schema: {
          deviceId: z
            .string()
            .optional()
            .describe('HarmonyOS device ID (from hdc list targets)'),
        },
        handler: async (args: { deviceId?: string; sessionId?: string }) =>
          this.runWithInvocationContext(
            args as Record<string, unknown>,
            async () => {
              const agent = await this.ensureAgent(args.deviceId);
              const screenshot = await agent.page.screenshotBase64();

              return {
                content: [
                  {
                    type: 'text',
                    text: `Connected to HarmonyOS device${args.deviceId ? `: ${args.deviceId}` : ' (auto-detected)'}`,
                  },
                  ...this.buildScreenshotContent(screenshot),
                ],
                isError: false,
              };
            },
          ),
      },
      {
        name: 'harmony_disconnect',
        description:
          'Disconnect from current HarmonyOS device and release HDC resources',
        schema: {},
        handler: this.createDisconnectHandler('HarmonyOS device'),
      },
      createExportSessionReportTool(),
    ];
  }
}
