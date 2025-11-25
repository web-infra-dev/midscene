import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

// Avoid circular dependency: don't import from @midscene/core
// Instead, use generic types that will be provided by implementation

export interface ToolDefinition {
  name: string;
  description: string;
  schema: any;
  handler: (...args: any[]) => Promise<any>;
  autoDestroy?: boolean;
}

export interface IMidsceneTools {
  attachToServer(server: McpServer): void;
  initTools(): Promise<void>;
  closeBrowser?(): Promise<void>;
}
