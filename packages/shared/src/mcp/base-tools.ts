import { getDebug } from '@midscene/shared/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  generateCommonTools,
  generateToolsFromActionSpace,
} from './tool-generator';
import type { IMidsceneTools, ToolDefinition } from './types';

const debug = getDebug('mcp:base-tools');

export abstract class BaseMidsceneTools implements IMidsceneTools {
  protected mcpServer?: McpServer;
  protected agent?: any;
  protected toolDefinitions: ToolDefinition[] = [];

  /**
   * Must be implemented by subclasses to create platform-specific agent
   */
  protected abstract ensureAgent(initParam?: string): Promise<any>;

  /**
   * Optional: prepare platform-specific tools (e.g., device connection)
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [];
  }

  /**
   * Initialize all tools by querying actionSpace
   */
  public async initTools(): Promise<void> {
    this.toolDefinitions = [];

    // 1. Get agent and its action space
    const agent = await this.ensureAgent();
    const actionSpace = await agent.getActionSpace();

    debug('Action space:', actionSpace.map((a: any) => a.name).join(', '));

    // 2. Generate tools from action space (core innovation)
    const actionTools = generateToolsFromActionSpace(actionSpace, () =>
      this.ensureAgent(),
    );

    // 3. Add common tools (screenshot, waitFor, assert)
    const commonTools = generateCommonTools(() => this.ensureAgent());

    // 4. Add platform-specific tools (device connection, etc.)
    const platformTools = this.preparePlatformTools();

    this.toolDefinitions.push(...actionTools, ...commonTools, ...platformTools);

    debug('Total tools prepared:', this.toolDefinitions.length);
  }

  /**
   * Attach to MCP server and register all tools
   */
  public attachToServer(server: McpServer): void {
    this.mcpServer = server;

    if (this.toolDefinitions.length === 0) {
      throw new Error('No tools. Call initTools() first.');
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
            await this.agent?.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
          this.agent = undefined;
        }
      }
    });
  }

  /**
   * Cleanup method
   */
  public async closeBrowser(): Promise<void> {
    await this.agent?.destroy();
  }
}
