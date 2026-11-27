import { z } from '@midscene/core';
import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
} from '@midscene/shared/agent-tools/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/agent-tools/base-tools';
import { stripBehaviorFlags } from '@midscene/shared/agent-tools/tool-defaults';
import type { ToolDefinition } from '@midscene/shared/agent-tools/types';
import { CLIError, parseCliArgs, stripVerboseFlag } from '@midscene/shared/cli';
import { type ScreenRelayAgent, agentForScreenRelay } from './agent';
import {
  type ScreenRelayCapabilities,
  createDefaultScreenRelayClient,
  formatScreenRelayError,
} from './client';
import { ScreenRelayDevice, type ScreenRelayDeviceOpt } from './device';
import {
  DEFAULT_SCREEN_RELAY_TIMEOUT_MS,
  MIDSCENE_SCREEN_RELAY_URL,
  parseScreenRelayTarget,
} from './target';

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

type ScreenRelayInitArgs = Pick<
  ScreenRelayDeviceOpt,
  'url' | 'token' | 'timeoutMs'
> &
  AgentBehaviorInitArgs;

export class ScreenRelayMidsceneTools extends BaseMidsceneTools<
  ScreenRelayAgent,
  ScreenRelayInitArgs
> {
  private helpInput?: ScreenRelayCapabilities['input'];

  constructor(
    private readonly argv: readonly string[],
    private readonly cliToken?: string,
  ) {
    super();
  }

  protected readonly initArgSpec: InitArgSpec<ScreenRelayInitArgs> = {
    namespace: 'screen_relay',
    shape: screenRelayInitArgShape,
    cli: {
      preferBareKeys: true,
    },
  };

  protected createTemporaryDevice() {
    return {
      actionSpace: () => ScreenRelayDevice.actionCatalog(this.helpInput),
    };
  }

  public override async initTools() {
    this.helpInput = undefined;
    const { rawArgs } = stripVerboseFlag(this.argv);
    const [command, ...options] = stripBehaviorFlags(rawArgs).rawArgs;
    if (command === '--help' || command === '-h') {
      const args = parseCliArgs(options);
      if (args.url !== undefined) {
        const { client } = this.queryTarget(
          args.url,
          args['timeout-ms'] ?? args.timeoutMs,
        );
        const capabilities = await client.capabilities().catch((error) => {
          throw formatScreenRelayError('help', error);
        });
        this.helpInput = capabilities.input;
      }
    }
    await super.initTools();
  }

  private queryTarget(url: unknown, timeoutMs: unknown) {
    if (typeof url !== 'string' || !url.trim()) {
      throw new CLIError('Missing required option: --url');
    }
    const timeout = screenRelayInitArgShape.timeoutMs.safeParse(timeoutMs);
    if (!timeout.success) {
      throw new CLIError(
        'Expected a finite positive number after --timeout-ms.',
      );
    }
    const target = parseScreenRelayTarget({ url, token: this.cliToken });
    const client = createDefaultScreenRelayClient({
      ...target,
      timeout: timeout.data ?? DEFAULT_SCREEN_RELAY_TIMEOUT_MS,
    });
    return { url: target.url, client };
  }

  protected override extractAgentInitParam(args: Record<string, unknown>) {
    const opts = super.extractAgentInitParam(args);
    return this.cliToken ? { ...opts, token: this.cliToken } : opts;
  }

  public override getCliToolDefinitions(): ToolDefinition[] {
    return [
      ...super.getCliToolDefinitions(),
      {
        name: 'status',
        description: 'Show screen-relay engine status as JSON.',
        schema: {
          url: z
            .string()
            .optional()
            .describe(
              'screen-relay server URL or full Viewer URL. Defaults to MIDSCENE_SCREEN_RELAY_URL.',
            ),
          token: screenRelayInitArgShape.token,
          'timeout-ms': screenRelayInitArgShape.timeoutMs,
        },
        handler: async ({ url: rawUrl, 'timeout-ms': timeoutMs }) => {
          const targetUrl =
            rawUrl !== undefined
              ? rawUrl
              : process.env[MIDSCENE_SCREEN_RELAY_URL]?.trim();
          const { url, client } = this.queryTarget(targetUrl, timeoutMs);
          try {
            const capabilities = await client.capabilities();
            const metrics = await client.status();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    session: { url, state: 'ready', capabilities, metrics },
                  }),
                },
              ],
            };
          } catch (error) {
            throw formatScreenRelayError('status', error);
          }
        },
      },
      {
        name: 'playground',
        description:
          'Open the Midscene Playground for this screen-relay desktop.',
        schema: {
          ...this.getAgentInitArgSchema(),
          port: z
            .number()
            .int()
            .min(1)
            .max(65535)
            .optional()
            .describe('Local Playground server port (default 5800).'),
          'no-open': z
            .boolean()
            .optional()
            .describe('Print the Playground URL without opening a browser.'),
        },
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args) => {
          const { playgroundForAgentFactory, buildPlaygroundBrowserUrl } =
            await import('@midscene/playground');
          const opts = this.extractAgentInitParam(args);
          const playground = await playgroundForAgentFactory(() =>
            agentForScreenRelay(opts),
          ).launch({
            port: typeof args.port === 'number' ? args.port : undefined,
            openBrowser: !args['no-open'],
          });
          console.log(
            `Playground: ${buildPlaygroundBrowserUrl(playground.host, playground.port)} (Ctrl+C to stop)`,
          );
          await new Promise<void>((resolve) => {
            const stop = () => {
              process.off('SIGINT', stop);
              process.off('SIGTERM', stop);
              resolve();
            };
            process.once('SIGINT', stop);
            process.once('SIGTERM', stop);
          });
          await playground.close();
          return { content: [] };
        },
      },
    ];
  }

  protected override async ensureAgent(opts?: ScreenRelayInitArgs) {
    this.agent ??= await agentForScreenRelay(opts);
    return this.agent;
  }
}
