import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
  extractAgentBehaviorInitArgs,
  getAgentInitArgsSignature,
  shouldRebuildAgentForInitArgs,
} from '@midscene/shared/mcp/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { type HarmonyAgent, agentFromHdcDevice } from './agent';
import { HarmonyDevice } from './device';

const debug = getDebug('mcp:harmony-tools');

type HarmonyInitArgs = AgentBehaviorInitArgs & {
  deviceId?: string;
};

function adaptHarmonyInitArgs(
  extracted: Record<string, unknown> | undefined,
): HarmonyInitArgs | undefined {
  if (!extracted) {
    return undefined;
  }

  const initArgs: HarmonyInitArgs = {
    ...(typeof extracted.deviceId === 'string'
      ? { deviceId: extracted.deviceId }
      : {}),
    ...(extractAgentBehaviorInitArgs(extracted as AgentBehaviorInitArgs) ?? {}),
  };

  return Object.keys(initArgs).length > 0 ? initArgs : undefined;
}

export class HarmonyMidsceneTools extends BaseMidsceneTools<
  HarmonyAgent,
  HarmonyInitArgs
> {
  private lastInitArgsSignature?: string;

  protected getCliReportSessionName() {
    return 'midscene-harmony';
  }

  protected readonly initArgSpec: InitArgSpec<HarmonyInitArgs> = {
    namespace: 'harmony',
    shape: {
      deviceId: z
        .string()
        .optional()
        .describe('HarmonyOS device ID (from hdc list targets)'),
      ...agentBehaviorInitArgShape,
    },
    cli: {
      preferBareKeys: true,
    },
    adapt: adaptHarmonyInitArgs,
  };

  protected createTemporaryDevice() {
    return new HarmonyDevice('temp-for-action-space', {});
  }

  protected async ensureAgent(
    initArgs?: HarmonyInitArgs,
  ): Promise<HarmonyAgent> {
    const deviceId = initArgs?.deviceId;
    const nextSignature = getAgentInitArgsSignature(initArgs);

    if (
      this.agent &&
      shouldRebuildAgentForInitArgs(this.lastInitArgsSignature, nextSignature)
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
    const reportOptions = this.readCliReportAgentOptions();
    const agent = await agentFromHdcDevice(deviceId, {
      autoDismissKeyboard: false,
      ...(extractAgentBehaviorInitArgs(initArgs) ?? {}),
      ...(reportOptions ?? {}),
    });
    this.agent = agent;
    this.lastInitArgsSignature = nextSignature;
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
            this.lastInitArgsSignature = undefined;
          }
          const agent = await this.ensureAgent(initArgs);
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
