import { z } from '@midscene/core';
import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
  extractAgentBehaviorInitArgs,
  getAgentInitArgsSignature,
  shouldRebuildAgentForInitArgs,
} from '@midscene/shared/agent-tools/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/agent-tools/base-tools';
import type { ToolDefinition } from '@midscene/shared/agent-tools/types';
import { getDebug } from '@midscene/shared/logger';
import { type ScreenRelayAgent, agentForScreenRelay } from './agent';
import { ScreenRelayDevice, type ScreenRelayDeviceOpt } from './device';
import { parseScreenRelayTarget } from './target';

const debug = getDebug('agent-tools:screen-relay');

const screenRelayInitArgShape = {
  url: z
    .string()
    .optional()
    .describe(
      'screen-relay server URL or full Viewer URL (supports #token=...). Defaults to MIDSCENE_SCREEN_RELAY_URL or http://127.0.0.1:8080.',
    ),
  token: z
    .string()
    .optional()
    .describe(
      'Session token (overrides #token= in url). Defaults to MIDSCENE_SCREEN_RELAY_TOKEN.',
    ),
  timeoutMs: z
    .number()
    .positive()
    .finite()
    .optional()
    .describe('Per-request timeout in milliseconds (default 15000).'),
  ...agentBehaviorInitArgShape,
};

export type ScreenRelayInitArgs = Pick<
  ScreenRelayDeviceOpt,
  'url' | 'token' | 'timeoutMs'
> &
  AgentBehaviorInitArgs;

export class ScreenRelayMidsceneTools extends BaseMidsceneTools<
  ScreenRelayAgent,
  ScreenRelayInitArgs
> {
  private lastInitArgsSignature?: string;

  protected getCliReportSessionName() {
    return 'midscene-screen-relay';
  }

  protected readonly initArgSpec: InitArgSpec<ScreenRelayInitArgs> = {
    namespace: 'screen_relay',
    shape: screenRelayInitArgShape,
    cli: {
      preferBareKeys: true,
    },
  };

  protected createTemporaryDevice() {
    return new ScreenRelayDevice({});
  }

  protected async ensureAgent(
    opts?: ScreenRelayInitArgs,
  ): Promise<ScreenRelayAgent> {
    const nextSignature = getAgentInitArgsSignature(opts);

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

    const reportOptions = this.readCliReportAgentOptions();
    const agentOpts = {
      ...(opts?.url ? { url: opts.url } : {}),
      ...(opts?.token ? { token: opts.token } : {}),
      ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(extractAgentBehaviorInitArgs(opts) ?? {}),
      ...(reportOptions ?? {}),
    };

    const agent = await agentForScreenRelay(
      Object.keys(agentOpts).length > 0 ? agentOpts : undefined,
    );
    this.agent = agent;
    this.lastInitArgsSignature = nextSignature;
    return agent;
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'screen_relay_connect',
        description:
          'Connect to a remote or local desktop running screen-relay. Supports pasting the full Viewer URL with #token=... directly into url.',
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const resolved = parseScreenRelayTarget({
            url: initArgs?.url,
            token: initArgs?.token,
          });
          const reportSession = this.createNewCliReportSession(resolved.url);
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
          const screenshot = await agent.interface.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to ${agent.interface.describe()}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
          };
        },
      },
      {
        name: 'screen_relay_disconnect',
        description: 'Disconnect from screen-relay and release resources',
        schema: {},
        handler: this.createDisconnectHandler('screen-relay'),
      },
      {
        name: 'screen_relay_capabilities',
        description:
          'Query capabilities of the connected screen-relay desktop (backend, resolution, and supported input features)',
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const agent = await this.ensureAgent(initArgs);
          const caps = agent.interface.getCapabilities();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(caps ?? {}, null, 2),
              },
            ],
          };
        },
      },
    ];
  }
}
