import { setIsMcp } from '@midscene/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { IMidsceneTools } from './types';

export interface BaseMCPServerConfig {
  name: string;
  version: string;
  description: string;
}

/**
 * Base MCP Server class with programmatic launch() API
 * Each platform extends this to provide their own tools manager
 */
export abstract class BaseMCPServer {
  protected mcpServer: McpServer;
  protected toolsManager?: IMidsceneTools;
  protected config: BaseMCPServerConfig;

  constructor(config: BaseMCPServerConfig) {
    this.config = config;
    this.mcpServer = new McpServer({
      name: config.name,
      version: config.version,
      description: config.description,
    });
  }

  /**
   * Platform-specific: create tools manager instance
   */
  protected abstract createToolsManager(): IMidsceneTools;

  /**
   * Initialize and launch the MCP server
   * Can be called programmatically or from CLI
   */
  public async launch(): Promise<void> {
    setIsMcp(true);

    // Create platform-specific tools manager
    this.toolsManager = this.createToolsManager();

    // Initialize tools (queries actionSpace)
    await this.toolsManager.initTools();

    // Attach to MCP server
    this.toolsManager.attachToServer(this.mcpServer);

    // Connect transport
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    // Setup cleanup on close
    this.setupCleanup();
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanup(): void {
    process.stdin.on('close', () => {
      console.error(`${this.config.name} closing...`);
      this.mcpServer.close();
      this.toolsManager?.closeBrowser?.().catch(console.error);
    });
  }

  /**
   * Get the underlying MCP server instance
   */
  public getServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the tools manager instance
   */
  public getToolsManager(): IMidsceneTools | undefined {
    return this.toolsManager;
  }
}
