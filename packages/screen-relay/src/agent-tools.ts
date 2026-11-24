import { type DeviceAction, z } from '@midscene/core';
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
import { ScreenRelayAgent, agentForScreenRelay } from './agent';
import { ScreenRelayDevice, type ScreenRelayDeviceOpt } from './device';
import { DEFAULT_SCREEN_RELAY_URL, MIDSCENE_SCREEN_RELAY_URL } from './target';

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

/**
 * Hoist `--help` / `-h` to index 0 when only options (no subcommand) precede it,
 * so `midscene-screen-relay --url http://... --help` behaves identically to
 * `midscene-screen-relay --help --url http://...`.
 */
export function normalizeScreenRelayHelpArgv(
  argv: readonly string[],
): string[] {
  const { rawArgs: withoutVerbose } = stripVerboseFlag([...argv]);
  const { rawArgs: coreArgs } = stripBehaviorFlags(withoutVerbose);
  const hasHelp = coreArgs.some((arg) => arg === '--help' || arg === '-h');
  if (
    hasHelp &&
    coreArgs[0]?.startsWith('-') &&
    coreArgs[0] !== '--help' &&
    coreArgs[0] !== '-h'
  ) {
    return [
      '--help',
      ...argv.filter((arg) => arg !== '--help' && arg !== '-h'),
    ];
  }
  return [...argv];
}

export class ScreenRelayMidsceneTools extends BaseMidsceneTools<
  ScreenRelayAgent,
  ScreenRelayInitArgs
> {
  private device?: ScreenRelayDevice;
  private discoveredActions?: DeviceAction<any>[];

  constructor(
    private readonly argv: string[],
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
    if (this.discoveredActions) {
      const actions = this.discoveredActions;
      return { actionSpace: () => actions };
    }
    return new ScreenRelayDevice({ url: DEFAULT_SCREEN_RELAY_URL });
  }

  protected override extractAgentInitParam(args: Record<string, unknown>) {
    const opts = super.extractAgentInitParam(args);
    return this.cliToken ? { ...opts, token: this.cliToken } : opts;
  }

  public override getCliToolDefinitions(): ToolDefinition[] {
    return [
      ...super.getCliToolDefinitions(),
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

  public override async initTools() {
    this.discoveredActions = undefined;
    const normalized = normalizeScreenRelayHelpArgv(this.argv);
    const { rawArgs } = stripVerboseFlag(normalized);
    await this.discoverDeviceActions(stripBehaviorFlags(rawArgs).rawArgs);
    await super.initTools();
  }

  private async discoverDeviceActions([command, ...args]: string[]) {
    const name = command?.toLowerCase();
    if (name === '--version' || name === '-v' || name === 'version') {
      return;
    }

    const rootHelp = !name || name === '--help' || name === '-h';
    const subcommandHelp =
      !rootHelp && args.some((arg) => arg === '--help' || arg === '-h');
    if (subcommandHelp) {
      return;
    }

    const options = parseCliArgs(args);
    const url = options.url;
    const timeoutMs = options['timeout-ms'] ?? options.timeoutMs;
    const token =
      this.cliToken ??
      (typeof options.token === 'string' ? options.token : undefined);

    if (rootHelp) {
      const explicitTarget =
        url !== undefined
          ? url
          : process.env[MIDSCENE_SCREEN_RELAY_URL]?.trim();
      if (!explicitTarget) {
        return;
      }
      if (url !== undefined && typeof url !== 'string') {
        throw new CLIError('Expected a URL after --url.');
      }
      if (timeoutMs !== undefined && typeof timeoutMs !== 'number') {
        throw new CLIError('Expected a number after --timeout-ms.');
      }
      const probeDevice = new ScreenRelayDevice({
        url,
        timeoutMs,
        token,
      });
      try {
        await probeDevice.connect();
        this.discoveredActions = probeDevice.actionSpace();
      } finally {
        await probeDevice.destroy();
      }
      return;
    }

    // Common and local commands have their own handlers. Only native actions
    // need discovery before the CLI can dispatch them.
    const catalog = new ScreenRelayDevice({ url: DEFAULT_SCREEN_RELAY_URL });
    const known = catalog
      .actionSpace()
      .some((action) => action.name.toLowerCase() === name);
    await catalog.destroy();
    if (!known) return;

    if (url !== undefined && typeof url !== 'string') {
      throw new CLIError('Expected a URL after --url.');
    }
    if (timeoutMs !== undefined && typeof timeoutMs !== 'number') {
      throw new CLIError('Expected a number after --timeout-ms.');
    }
    const device = new ScreenRelayDevice({
      url,
      timeoutMs,
      token,
    });
    await device.connect();
    const actions = device.actionSpace();
    if (!actions.some((action) => action.name.toLowerCase() === name)) {
      await device.destroy();
      throw new CLIError(
        `The current screen-relay device does not support "${command}".`,
      );
    }
    this.device = device;
    this.discoveredActions = actions;
  }

  protected override async ensureAgent(opts?: ScreenRelayInitArgs) {
    this.agent ??= this.device
      ? new ScreenRelayAgent(this.device, opts)
      : await agentForScreenRelay(opts);
    return this.agent;
  }

  public override async destroy(): Promise<void> {
    const agent = this.agent;
    const device = this.device;
    this.agent = undefined;
    this.device = undefined;
    try {
      await agent?.destroy?.();
    } finally {
      await device?.destroy();
    }
  }
}
