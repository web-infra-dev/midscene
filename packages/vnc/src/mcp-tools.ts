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

  protected async ensureAgent(opts: {
    host?: string;
    port?: number;
    password?: string;
    username?: string;
    domain?: string;
  }): Promise<VNCAgent> {
    const targetHost = opts.host || this.currentHost || 'localhost';
    const targetPort = opts.port || this.currentPort || 5900;

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
      password: opts.password,
      username: opts.username,
      domain: opts.domain,
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
          'Connect to a remote VNC server. Provide host and port to specify the target. For standard VNC auth, provide password. For NTLM auth, provide username, password, and optionally domain.',
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
            .describe('VNC password (for VNC auth or NTLM auth)'),
          username: z
            .string()
            .optional()
            .describe('Username (only for NTLM auth)'),
          domain: z
            .string()
            .optional()
            .describe("Windows domain (only for NTLM auth, default: 'WORKGROUP')"),
        },
        handler: async (params: {
          host?: string;
          port?: number;
          password?: string;
          username?: string;
          domain?: string;
        }) => {
          const agent = await this.ensureAgent(params);
          const screenshot = await agent.interface.screenshotBase64();
          const targetHost = params.host || 'localhost';
          const targetPort = params.port || 5900;

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
