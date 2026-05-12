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
import type { RDPConnectionConfig } from './rdp/protocol';

const debug = getDebug('mcp:computer-tools');

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
  host: z
    .string()
    .optional()
    .describe('RDP host (FQDN or IP). Set this to connect via RDP.'),
  port: z
    .number()
    .optional()
    .describe('RDP port (default 3389). RDP mode only.'),
  username: z.string().optional().describe('RDP username. RDP mode only.'),
  password: z
    .string()
    .optional()
    .describe(
      'RDP password. RDP mode only. Prefer setting via environment or a secrets manager.',
    ),
  domain: z.string().optional().describe('RDP domain. RDP mode only.'),
  adminSession: z
    .boolean()
    .optional()
    .describe('Attach to the RDP admin/console session. RDP mode only.'),
  ignoreCertificate: z
    .boolean()
    .optional()
    .describe('Skip TLS certificate validation. RDP mode only.'),
  securityProtocol: z
    .enum(['auto', 'tls', 'nla', 'rdp'])
    .optional()
    .describe(
      'RDP security protocol negotiation (default auto). RDP mode only.',
    ),
  desktopWidth: z
    .number()
    .optional()
    .describe('Remote desktop width in pixels. RDP mode only.'),
  desktopHeight: z
    .number()
    .optional()
    .describe('Remote desktop height in pixels. RDP mode only.'),
};

type ComputerLocalInitArgs = Pick<ComputerDeviceOpt, 'displayId' | 'headless'>;
type ComputerRDPInitArgs = Pick<
  RDPConnectionConfig,
  | 'host'
  | 'port'
  | 'username'
  | 'password'
  | 'domain'
  | 'adminSession'
  | 'ignoreCertificate'
  | 'securityProtocol'
  | 'desktopWidth'
  | 'desktopHeight'
>;
type ComputerInitArgs = ComputerLocalInitArgs & ComputerRDPInitArgs;

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
    adapt: (extracted) => extracted as ComputerInitArgs | undefined,
  };

  protected createTemporaryDevice() {
    // Create minimal temporary instance
    return new ComputerDevice({});
  }

  protected async ensureAgent(opts?: ComputerInitArgs): Promise<ComputerAgent> {
    const hasAnyOpt = !!opts && Object.keys(opts).length > 0;

    if (this.agent && hasAnyOpt) {
      // Any new init args force a fresh agent so subsequent calls cannot
      // silently reuse a session bound to a different display or RDP host.
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

    if (opts?.host) {
      debug('Creating RDP Computer agent for host:', opts.host);
      const rdpOpts = {
        host: opts.host,
        ...(opts.port !== undefined ? { port: opts.port } : {}),
        ...(opts.username !== undefined ? { username: opts.username } : {}),
        ...(opts.password !== undefined ? { password: opts.password } : {}),
        ...(opts.domain !== undefined ? { domain: opts.domain } : {}),
        ...(opts.adminSession !== undefined
          ? { adminSession: opts.adminSession }
          : {}),
        ...(opts.ignoreCertificate !== undefined
          ? { ignoreCertificate: opts.ignoreCertificate }
          : {}),
        ...(opts.securityProtocol !== undefined
          ? { securityProtocol: opts.securityProtocol }
          : {}),
        ...(opts.desktopWidth !== undefined
          ? { desktopWidth: opts.desktopWidth }
          : {}),
        ...(opts.desktopHeight !== undefined
          ? { desktopHeight: opts.desktopHeight }
          : {}),
        ...(reportOptions ?? {}),
      };
      const agent = await agentForRDPComputer(rdpOpts);
      this.agent = agent;
      return agent;
    }

    const displayId = opts?.displayId;
    const headless = opts?.headless;
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
        description:
          'Connect to a computer desktop. Default (local) mode controls the local machine; pass displayId to target a specific local display (see computer_list_displays). Pass host (with optional port/username/password/domain/securityProtocol/ignoreCertificate/adminSession/desktopWidth/desktopHeight) to connect to a remote Windows desktop via RDP instead.',
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const targetIdentity = initArgs?.host
            ? `rdp:${initArgs.host}`
            : (initArgs?.displayId ?? 'primary');
          const reportSession = this.createNewCliReportSession(targetIdentity);
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

          const connectedDescription = initArgs?.host
            ? ` via RDP (${initArgs.host}${initArgs.port ? `:${initArgs.port}` : ''}${
                initArgs.username ? ` as ${initArgs.username}` : ''
              })`
            : initArgs?.displayId
              ? ` (Display: ${initArgs.displayId})`
              : ' (Primary display)';

          return {
            content: [
              {
                type: 'text',
                text: `Connected to computer${connectedDescription}`,
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
