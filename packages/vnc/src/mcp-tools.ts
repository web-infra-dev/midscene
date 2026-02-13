import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { type VNCAgent, agentFromVNC } from './agent';
import { VNCDevice } from './device';

const debug = getDebug('mcp:vnc-tools');

/**
 * VNC-specific tools manager
 * Extends BaseMidsceneTools to provide VNC remote desktop automation tools
 */
export class VNCMidsceneTools extends BaseMidsceneTools<VNCAgent> {
  private currentHost?: string;
  private currentPort?: number;

  protected createTemporaryDevice() {
    // Create a minimal temporary instance for action space initialization
    return new VNCDevice({ host: 'localhost', port: 5900 });
  }

  protected async ensureAgent(
    host?: string,
    port?: number,
    password?: string,
  ): Promise<VNCAgent> {
    const targetHost = host || this.currentHost || 'localhost';
    const targetPort = port || this.currentPort || 5900;

    // If reconnecting to a different server, destroy existing agent
    if (
      this.agent &&
      (targetHost !== this.currentHost || targetPort !== this.currentPort)
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

    debug('Creating VNC agent for %s:%d', targetHost, targetPort);
    const agent = await agentFromVNC({
      host: targetHost,
      port: targetPort,
      password,
    });

    this.agent = agent;
    this.currentHost = targetHost;
    this.currentPort = targetPort;
    return agent;
  }

  /**
   * Provide VNC-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'vnc_connect',
        description:
          'Connect to a remote VNC server. Provide host and port to specify the target. An optional password can be provided for VNC authentication.',
        schema: {
          host: z
            .string()
            .optional()
            .describe('VNC server hostname or IP (default: localhost)'),
          port: z
            .number()
            .optional()
            .describe('VNC server port (default: 5900)'),
          password: z
            .string()
            .optional()
            .describe('VNC server password (if authentication is required)'),
        },
        handler: async ({
          host,
          port,
          password,
        }: {
          host?: string;
          port?: number;
          password?: string;
        }) => {
          const agent = await this.ensureAgent(host, port, password);
          const screenshot = await agent.interface.screenshotBase64();
          const targetHost = host || 'localhost';
          const targetPort = port || 5900;

          return {
            content: [
              {
                type: 'text',
                text: `Connected to VNC server at ${targetHost}:${targetPort}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
          };
        },
      },
      {
        name: 'vnc_disconnect',
        description: 'Disconnect from VNC server and release resources',
        schema: {},
        handler: this.createDisconnectHandler('vnc'),
      },
    ];
  }
}
