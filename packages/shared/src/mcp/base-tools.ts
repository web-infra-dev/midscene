import { parseBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  generateCommonTools,
  generateToolsFromActionSpace,
} from './tool-generator';
import type {
  ActionSpaceItem,
  BaseAgent,
  BaseDevice,
  IMidsceneTools,
  ToolDefinition,
} from './types';

const debug = getDebug('mcp:base-tools');

/**
 * Base class for platform-specific MCP tools
 * Generic type TAgent allows subclasses to use their specific agent types
 */
export abstract class BaseMidsceneTools<TAgent extends BaseAgent = BaseAgent>
  implements IMidsceneTools
{
  protected mcpServer?: McpServer;
  protected agent?: TAgent;
  protected toolDefinitions: ToolDefinition[] = [];

  /**
   * Ensure agent is initialized and ready for use.
   * Must be implemented by subclasses to create platform-specific agent.
   * @param initParam Optional initialization parameter (platform-specific, e.g., URL, device ID)
   * @returns Promise resolving to initialized agent instance
   * @throws Error if agent initialization fails
   */
  protected abstract ensureAgent(initParam?: string): Promise<TAgent>;

  /**
   * Optional: prepare platform-specific tools (e.g., device connection)
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [];
  }

  /**
   * Must be implemented by subclasses to create a temporary device instance
   * This allows getting real actionSpace without connecting to device
   */
  protected abstract createTemporaryDevice(): BaseDevice;

  /**
   * Initialize all tools by querying actionSpace
   * Uses two-layer fallback strategy:
   * 1. Try to get actionSpace from connected agent (if available)
   * 2. Create temporary device instance to read actionSpace (always succeeds)
   */
  public async initTools(): Promise<void> {
    this.toolDefinitions = [];

    // 1. Add platform-specific tools first (device connection, etc.)
    // These don't require an agent and should always be available
    const platformTools = this.preparePlatformTools();
    this.toolDefinitions.push(...platformTools);

    // 2. Try to get agent and its action space (two-layer fallback)
    let actionSpace: ActionSpaceItem[];
    try {
      // Layer 1: Try to use connected agent
      const agent = await this.ensureAgent();
      actionSpace = await agent.getActionSpace();
      debug(
        'Action space from connected agent:',
        actionSpace.map((a) => a.name).join(', '),
      );
    } catch (error) {
      // Layer 2: Create temporary device instance to read actionSpace
      // This is expected behavior for bridge mode without URL or unconnected devices
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('requires a URL') ||
        errorMessage.includes('web_connect')
      ) {
        debug(
          'Bridge mode detected - agent will be initialized on first web_connect call',
        );
      } else {
        debug(
          'Agent not available yet, using temporary device for action space',
        );
      }
      const tempDevice = this.createTemporaryDevice();
      actionSpace = tempDevice.actionSpace();
      debug(
        'Action space from temporary device:',
        actionSpace.map((a) => a.name).join(', '),
      );

      // Destroy temporary instance using optional chaining
      await tempDevice.destroy?.();
    }

    // 3. Generate tools from action space (core innovation)
    const actionTools = generateToolsFromActionSpace(actionSpace, () =>
      this.ensureAgent(),
    );

    // 4. Add common tools (screenshot, waitFor)
    const commonTools = generateCommonTools(() => this.ensureAgent());

    this.toolDefinitions.push(...actionTools, ...commonTools);

    debug('Total tools prepared:', this.toolDefinitions.length);
  }

  /**
   * Attach to MCP server and register all tools
   */
  public attachToServer(server: McpServer): void {
    this.mcpServer = server;

    if (this.toolDefinitions.length === 0) {
      debug('Warning: No tools to register. Tools may be initialized lazily.');
    }

    for (const toolDef of this.toolDefinitions) {
      if (toolDef.autoDestroy) {
        this.toolWithAutoDestroy(
          toolDef.name,
          toolDef.description,
          toolDef.schema,
          toolDef.handler,
        );
      } else {
        this.mcpServer.tool(
          toolDef.name,
          toolDef.description,
          toolDef.schema,
          toolDef.handler,
        );
      }
    }

    debug('Registered', this.toolDefinitions.length, 'tools');
  }

  /**
   * Wrapper for auto-destroy behavior
   */
  private toolWithAutoDestroy(
    name: string,
    description: string,
    schema: any,
    handler: (...args: any[]) => Promise<any>,
  ): void {
    if (!this.mcpServer) {
      throw new Error('MCP server not attached');
    }

    this.mcpServer.tool(name, description, schema, async (...args: any[]) => {
      try {
        return await handler(...args);
      } finally {
        if (!process.env.MIDSCENE_MCP_DISABLE_AGENT_AUTO_DESTROY) {
          try {
            await this.agent?.destroy?.();
          } catch (error) {
            debug('Failed to destroy agent during cleanup:', error);
          }
          this.agent = undefined;
        }
      }
    });
  }

  /**
   * Cleanup method - destroy agent and release resources
   */
  public async closeBrowser(): Promise<void> {
    await this.agent?.destroy?.();
  }

  /**
   * Get tool definitions
   */
  public getToolDefinitions(): ToolDefinition[] {
    return this.toolDefinitions;
  }

  /**
   * Set agent for the tools manager
   */
  public setAgent(agent: TAgent): void {
    this.agent = agent;
  }

  /**
   * Helper: Convert base64 screenshot to image content array
   */
  protected buildScreenshotContent(screenshot: string) {
    const { mimeType, body } = parseBase64(screenshot);
    return [
      {
        type: 'image' as const,
        data: body,
        mimeType,
      },
    ];
  }
}
