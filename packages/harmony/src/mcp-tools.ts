import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { type HarmonyAgent, agentFromHdcDevice } from './agent';
import { HarmonyDevice } from './device';

const debug = getDebug('mcp:harmony-tools');

export class HarmonyMidsceneTools extends BaseMidsceneTools<
  HarmonyAgent,
  string
> {
  protected getCliReportSessionName() {
    return 'midscene-harmony';
  }

  protected readonly initArgSpec: InitArgSpec<string> = {
    namespace: 'harmony',
    shape: {
      deviceId: z
        .string()
        .optional()
        .describe('HarmonyOS device ID (from hdc list targets)'),
    },
    cli: {
      preferBareKeys: true,
    },
    adapt: (extracted) => extracted?.deviceId as string | undefined,
  };

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
    const reportOptions = this.readCliReportAgentOptions();
    const agent = await agentFromHdcDevice(deviceId, {
      autoDismissKeyboard: false,
      ...(reportOptions ?? {}),
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
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const deviceId = this.extractAgentInitParam(args);
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
