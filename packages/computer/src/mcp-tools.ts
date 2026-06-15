import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import {
  type ComputerAgent,
  agentForRDPComputer,
  agentFromComputer,
} from './agent';
import { ComputerDevice, type ComputerDeviceOpt } from './device';
import {
  formatRdpHost,
  formatRdpServerAddress,
  normalizeRdpHost,
} from './rdp/address';
import type { RDPConnectionConfig, RDPSecurityProtocol } from './rdp/protocol';

const debug = getDebug('mcp:computer-tools');

const RDP_SECURITY_PROTOCOLS = [
  'auto',
  'tls',
  'nla',
  'rdp',
] as const satisfies readonly RDPSecurityProtocol[];

const computerInitArgShape = {
  displayId: z
    .string()
    .optional()
    .describe(
      'Display ID for local mode (from computer_list_displays). Ignored when host is set.',
    ),
  headless: z
    .boolean()
    .optional()
    .describe(
      'Start virtual display via Xvfb (Linux local mode only). Ignored when host is set.',
    ),
  // RDP options. Providing `host` switches connect into RDP mode and routes
  // the session through the RDP helper binary instead of the local desktop.
  // All other RDP options below are silently ignored unless `host` is set.
  host: z
    .string()
    .optional()
    .describe('RDP host (FQDN or IP). Set this to switch into RDP mode.'),
  port: z
    .number()
    .optional()
    .describe('RDP port (default 3389). Requires host.'),
  username: z.string().optional().describe('RDP username. Requires host.'),
  password: z
    .string()
    .optional()
    .describe(
      'RDP password. Requires host. Prefer setting via environment or a secrets manager.',
    ),
  domain: z.string().optional().describe('RDP domain. Requires host.'),
  localAddress: z
    .string()
    .optional()
    .describe(
      'Local source IP address for the RDP TCP connection. Requires host.',
    ),
  adminSession: z
    .boolean()
    .optional()
    .describe('Attach to the RDP admin/console session. Requires host.'),
  ignoreCertificate: z
    .boolean()
    .optional()
    .describe('Skip TLS certificate validation. Requires host.'),
  securityProtocol: z
    .enum(RDP_SECURITY_PROTOCOLS)
    .optional()
    .describe(
      'RDP security protocol negotiation (default auto). Requires host.',
    ),
  desktopWidth: z
    .number()
    .optional()
    .describe('Remote desktop width in pixels. Requires host.'),
  desktopHeight: z
    .number()
    .optional()
    .describe('Remote desktop height in pixels. Requires host.'),
};

/** Init args for the local desktop agent (macOS/Windows/Linux). */
export type ComputerLocalInitArgs = {
  mode: 'local';
} & Pick<ComputerDeviceOpt, 'displayId' | 'headless'>;

/** Init args for the RDP remote-desktop agent. */
export type ComputerRDPInitArgs = {
  mode: 'rdp';
} & RDPConnectionConfig;

/**
 * Discriminated union describing the two ways `computer_*` tools can spawn an
 * agent. `mode` is filled in by `initArgSpec.adapt` based on whether `host` is
 * set, so callers (CLI/MCP/YAML) never have to provide it explicitly.
 */
export type ComputerInitArgs = ComputerLocalInitArgs | ComputerRDPInitArgs;

type ExtractedComputerInitArgs = Partial<
  Pick<ComputerDeviceOpt, 'displayId' | 'headless'> & RDPConnectionConfig
>;

function adaptComputerInitArgs(
  extracted: ExtractedComputerInitArgs | undefined,
): ComputerInitArgs | undefined {
  if (!extracted || Object.keys(extracted).length === 0) {
    return undefined;
  }
  if (extracted.host) {
    // Drop local-only fields; they're meaningless in RDP mode.
    const { displayId: _d, headless: _h, ...rdpFields } = extracted;
    const host = normalizeRdpHost(extracted.host);
    return {
      mode: 'rdp',
      ...rdpFields,
      host,
    };
  }
  return {
    mode: 'local',
    displayId: extracted.displayId,
    headless: extracted.headless,
  };
}

function shouldRetargetAgent(opts: ComputerInitArgs | undefined): boolean {
  if (!opts) return false;
  if (opts.mode === 'rdp') return true;
  return opts.displayId !== undefined || opts.headless !== undefined;
}

function describeConnectTarget(opts: ComputerInitArgs | undefined): string {
  if (opts?.mode === 'rdp') {
    const target = opts.port
      ? formatRdpServerAddress(opts.host, opts.port)
      : formatRdpHost(opts.host);
    const userSuffix = opts.username ? ` as ${opts.username}` : '';
    return ` via RDP (${target}${userSuffix})`;
  }
  if (opts?.mode === 'local' && opts.displayId) {
    return ` (Display: ${opts.displayId})`;
  }
  return ' (Primary display)';
}

function getCliReportSessionTarget(opts: ComputerInitArgs | undefined): string {
  if (opts?.mode === 'rdp') return `rdp:${formatRdpHost(opts.host)}`;
  if (opts?.mode === 'local' && opts.displayId) return opts.displayId;
  return 'primary';
}

/**
 * Computer-specific tools manager
 * Extends BaseMidsceneTools to provide desktop automation tools
 */
export class ComputerMidsceneTools extends BaseMidsceneTools<
  ComputerAgent,
  ComputerInitArgs
> {
  protected getCliReportSessionName() {
    return 'midscene-computer';
  }

  protected readonly initArgSpec: InitArgSpec<ComputerInitArgs> = {
    namespace: 'computer',
    shape: computerInitArgShape,
    cli: {
      preferBareKeys: true,
    },
    adapt: (extracted) =>
      adaptComputerInitArgs(extracted as ExtractedComputerInitArgs | undefined),
  };

  protected createTemporaryDevice() {
    // Create minimal temporary instance
    return new ComputerDevice({});
  }

  protected async ensureAgent(opts?: ComputerInitArgs): Promise<ComputerAgent> {
    if (this.agent && shouldRetargetAgent(opts)) {
      // Only displayId/headless/host actually change the underlying device
      // target; for any of those we tear down the current agent so the next
      // call rebuilds against the new target.
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

    if (opts?.mode === 'rdp') {
      debug('Creating RDP Computer agent for host:', opts.host);
      const { mode: _mode, ...rdpFields } = opts;
      const agent = await agentForRDPComputer({
        ...rdpFields,
        ...(reportOptions ?? {}),
      });
      this.agent = agent;
      return agent;
    }

    const displayId = opts?.mode === 'local' ? opts.displayId : undefined;
    const headless = opts?.mode === 'local' ? opts.headless : undefined;
    debug('Creating Computer agent with displayId:', displayId || 'primary');
    const agentOpts = {
      ...(displayId ? { displayId } : {}),
      ...(headless !== undefined ? { headless } : {}),
      ...(reportOptions ?? {}),
    };
    const agent = await agentFromComputer(
      Object.keys(agentOpts).length > 0 ? agentOpts : undefined,
    );
    this.agent = agent;
    return agent;
  }

  /**
   * Provide Computer-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'computer_connect',
        description: [
          'Connect to a computer desktop.',
          'Default (local) mode controls the local machine; pass displayId to target a specific local display (see computer_list_displays).',
          'Pass host to switch to RDP mode and connect to a remote Windows desktop via the RDP helper binary.',
          'RDP-related options (port/username/password/domain/localAddress/securityProtocol/ignoreCertificate/adminSession/desktopWidth/desktopHeight) only take effect when host is set.',
        ].join(' '),
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const reportSession = this.createNewCliReportSession(
            getCliReportSessionTarget(initArgs),
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
          const agent = await this.ensureAgent(initArgs);
          const screenshot = await agent.interface.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to computer${describeConnectTarget(initArgs)}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
          };
        },
      },
      {
        name: 'computer_disconnect',
        description: 'Disconnect from computer and release resources',
        schema: {},
        handler: this.createDisconnectHandler('computer'),
      },
      {
        name: 'computer_list_displays',
        description: 'List all available displays/monitors',
        schema: {},
        handler: async () => {
          const displays = await ComputerDevice.listDisplays();
          return {
            content: [
              {
                type: 'text',
                text: `Available displays:\n${displays.map((d) => `- ${d.name} (ID: ${d.id})${d.primary ? ' [PRIMARY]' : ''}`).join('\n')}`,
              },
            ],
          };
        },
      },
    ];
  }
}
