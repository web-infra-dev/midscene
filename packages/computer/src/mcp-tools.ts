import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { type ComputerAgent, agentFromComputer } from './agent';
import { ComputerDevice } from './device';

const debug = getDebug('mcp:computer-tools');

/**
 * Computer-specific tools manager
 * Extends BaseMidsceneTools to provide desktop automation tools
 */
export class ComputerMidsceneTools extends BaseMidsceneTools<ComputerAgent> {
  protected createTemporaryDevice() {
    // Create minimal temporary instance
    return new ComputerDevice({});
  }

  protected async ensureAgent(displayId?: string): Promise<ComputerAgent> {
    if (this.agent && displayId) {
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
    const opts = displayId ? { displayId } : undefined;
    const agent = await agentFromComputer(opts);
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
        schema: {
          displayId: z
            .string()
            .optional()
            .describe('Display ID (from computer_list_displays)'),
        },
        handler: async ({ displayId }: { displayId?: string }) => {
          const agent = await this.ensureAgent(displayId);
          const screenshot = await agent.interface.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to computer${displayId ? ` (Display: ${displayId})` : ' (Primary display)'}`,
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
