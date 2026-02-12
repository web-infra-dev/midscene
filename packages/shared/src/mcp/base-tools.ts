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

    // 2. Get action space: use pre-set agent if available, otherwise temp device.
    //    When called via mcpKitForAgent(), agent is set before initTools().
    //    For CLI usage, agent is deferred to the first real command.
    let actionSpace: ActionSpaceItem[];
    if (this.agent) {
      actionSpace = await this.agent.getActionSpace();
      debug(
        'Action space from agent:',
        actionSpace.map((a) => a.name).join(', '),
      );
    } else {
      const tempDevice = this.createTemporaryDevice();
      actionSpace = tempDevice.actionSpace();
      await tempDevice.destroy?.();
      debug(
        'Action space from temporary device:',
        actionSpace.map((a) => a.name).join(', '),
      );
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
      this.mcpServer.tool(
        toolDef.name,
        toolDef.description,
        toolDef.schema,
        toolDef.handler,
      );
    }

    debug('Registered', this.toolDefinitions.length, 'tools');
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

  /**
   * Helper: Build a simple text result for tool responses
   */
  protected buildTextResult(text: string) {
    return {
      content: [{ type: 'text' as const, text }],
    };
  }

  /**
   * Create a disconnect handler for releasing platform resources
   * @param platformName Human-readable platform name for the response message
   * @returns Handler function that destroys the agent and returns appropriate response
   */
  protected createDisconnectHandler(platformName: string) {
    return async () => {
      if (!this.agent) {
        return this.buildTextResult('No active connection to disconnect');
      }

      try {
        await this.agent.destroy?.();
      } catch (error) {
        debug('Failed to destroy agent during disconnect:', error);
      }
      this.agent = undefined;

      return this.buildTextResult(`Disconnected from ${platformName}`);
    };
  }
}
