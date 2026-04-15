import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type ToolDefinition,
  createNamespacedInitArgSchema,
  extractNamespacedArgs,
  sanitizeNamespacedArgs,
} from '@midscene/shared/mcp';
import { type HarmonyAgent, agentFromHdcDevice } from './agent';
import { HarmonyDevice } from './device';

const debug = getDebug('mcp:harmony-tools');
const HARMONY_INIT_ARG_KEYS = ['deviceId'] as const;
type HarmonyInitArgs = { deviceId?: string };
const harmonyInitArgShape = {
  deviceId: z
    .string()
    .optional()
    .describe('HarmonyOS device ID (from hdc list targets)'),
};

export class HarmonyMidsceneTools extends BaseMidsceneTools<HarmonyAgent> {
  protected createTemporaryDevice() {
    return new HarmonyDevice('temp-for-action-space', {});
  }

  protected extractAgentInitParam(args: Record<string, unknown>): unknown {
    return extractNamespacedArgs<
      (typeof HARMONY_INIT_ARG_KEYS)[number],
      HarmonyInitArgs
    >(args, 'harmony', HARMONY_INIT_ARG_KEYS)?.deviceId;
  }

  protected sanitizeToolArgs(
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    return sanitizeNamespacedArgs(args, 'harmony', HARMONY_INIT_ARG_KEYS);
  }

  protected getAgentInitArgSchema() {
    return createNamespacedInitArgSchema('harmony', harmonyInitArgShape);
  }

  protected async ensureAgent(initParam?: unknown): Promise<HarmonyAgent> {
    const deviceId = typeof initParam === 'string' ? initParam : undefined;

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
    const agent = await agentFromHdcDevice(deviceId, {
      autoDismissKeyboard: false,
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
        schema: this.getAgentInitArgSchema(),
        handler: async (args: Record<string, unknown>) => {
          const deviceId = this.extractAgentInitParam(args) as
            | string
            | undefined;
          const agent = await this.ensureAgent(deviceId);
          const screenshot = await agent.page.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to HarmonyOS device${deviceId ? `: ${deviceId}` : ' (auto-detected)'}`,
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
    ];
  }
}
