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

  protected async ensureAgent(
    deviceId?: string,
    options?: { sessionId?: string },
  ): Promise<HarmonyAgent> {
    const sessionId = options?.sessionId;
    if (
      this.agent &&
      (deviceId || this.shouldResetAgentForSession(sessionId))
    ) {
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
      sessionId,
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
        handler: async (args: { deviceId?: string; sessionId?: string }) => {
          const agent = await this.ensureAgent(
            args.deviceId,
            this.getAgentOptions(args as Record<string, unknown>),
          );
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
