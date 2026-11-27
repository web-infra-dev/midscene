import { z } from '@midscene/core';
import type { Agent } from '@midscene/core/agent';
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
import { type RemoteDevice, agentOverConnectProtocol } from './client';

const debug = getDebug('connect:tools');

type ConnectInitArgs = AgentBehaviorInitArgs & { url?: string; token?: string };

/** CLI tools generated from the action space of a served device. */
export class ConnectMidsceneTools extends BaseMidsceneTools<
  Agent<RemoteDevice>,
  ConnectInitArgs
> {
  private lastInitArgsSignature?: string;

  constructor(
    /** Device fetched before tool generation; undefined when unreachable. */
    private readonly device: RemoteDevice | undefined,
  ) {
    super();
  }

  protected getCliReportSessionName() {
    return 'midscene-connect';
  }

  protected readonly initArgSpec: InitArgSpec<ConnectInitArgs> = {
    namespace: 'connect',
    shape: {
      url: z
        .string()
        .optional()
        .describe(
          'Device URL printed by `midscene-connect serve` (env: MIDSCENE_CONNECT_URL)',
        ),
      token: z
        .string()
        .optional()
        .describe('Device access token (env: MIDSCENE_CONNECT_TOKEN)'),
      ...agentBehaviorInitArgShape,
    },
    cli: { preferBareKeys: true },
    adapt: (extracted) => {
      if (!extracted) return undefined;
      const args: ConnectInitArgs = {
        ...(typeof extracted.url === 'string' ? { url: extracted.url } : {}),
        ...(typeof extracted.token === 'string'
          ? { token: extracted.token }
          : {}),
        ...(extractAgentBehaviorInitArgs(extracted as AgentBehaviorInitArgs) ??
          {}),
      };
      return Object.keys(args).length ? args : undefined;
    },
  };

  protected createTemporaryDevice() {
    return this.device ?? { actionSpace: () => [] };
  }

  protected async ensureAgent(initArgs?: ConnectInitArgs) {
    const signature = getAgentInitArgsSignature(initArgs);
    if (
      this.agent &&
      shouldRebuildAgentForInitArgs(this.lastInitArgsSignature, signature)
    ) {
      await this.agent
        .destroy()
        .catch((error) => debug('destroy failed:', error));
      this.agent = undefined;
    }
    if (this.agent) return this.agent;
    this.agent = await agentOverConnectProtocol({
      url: initArgs?.url,
      token: initArgs?.token,
      agentOptions: {
        ...(extractAgentBehaviorInitArgs(initArgs) ?? {}),
        ...(this.readCliReportAgentOptions() ?? {}),
      },
    });
    this.lastInitArgsSignature = signature;
    return this.agent;
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'connect_connect',
        description: 'Check the served device and start a new report session',
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          this.commitCliReportSession(
            this.createNewCliReportSession(initArgs?.url ?? 'default'),
          );
          if (this.agent) {
            await this.agent
              .destroy()
              .catch((error) => debug('destroy failed:', error));
            this.agent = undefined;
            this.lastInitArgsSignature = undefined;
          }
          const agent = await this.ensureAgent(initArgs);
          const screenshot = await agent.interface.screenshotBase64();
          return {
            content: [
              {
                type: 'text',
                text: `Connected to ${agent.interface.describe()} at ${agent.interface.client.url}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
            isError: false,
          };
        },
      },
    ];
  }
}
