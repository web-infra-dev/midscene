import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { type ComputerAgent, agentFromComputer } from './agent';
import { ComputerDevice, type ComputerDeviceOpt } from './device';

const debug = getDebug('mcp:computer-tools');

const computerInitArgShape = {
  displayId: z
    .string()
    .optional()
    .describe('Display ID (from computer_list_displays)'),
  headless: z
    .boolean()
    .optional()
    .describe('Start virtual display via Xvfb (Linux only)'),
};

type ComputerInitArgs = Pick<ComputerDeviceOpt, 'displayId' | 'headless'>;

/**
 * Computer-specific tools manager
 * Extends BaseMidsceneTools to provide desktop automation tools
 */
export class ComputerMidsceneTools extends BaseMidsceneTools<
  ComputerAgent,
  ComputerInitArgs
> {
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
    const displayId = opts?.displayId;
    const headless = opts?.headless;

    if (this.agent && (displayId !== undefined || headless !== undefined)) {
      // If a specific displayId is requested and we have an agent,
      // destroy it to create a new one with the new display
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

    debug('Creating Computer agent with displayId:', displayId || 'primary');
    const agentOpts = {
      ...(displayId ? { displayId } : {}),
      ...(headless !== undefined ? { headless } : {}),
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
          'Connect to computer desktop. Provide displayId to connect to a specific display (use computer_list_displays to get available IDs). If not provided, uses the primary display.',
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const agent = await this.ensureAgent(initArgs);
          const screenshot = await agent.interface.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to computer${initArgs?.displayId ? ` (Display: ${initArgs.displayId})` : ' (Primary display)'}`,
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
