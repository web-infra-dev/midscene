import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

// Avoid circular dependency: don't import from @midscene/core
// Instead, use generic types that will be provided by implementation

/**
 * Default timeout constants for app loading verification
 */
export const defaultAppLoadingTimeoutMs = 10000;
export const defaultAppLoadingCheckIntervalMs = 2000;

/**
 * Content item types for tool results (MCP compatible)
 */
export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | {
      type: 'resource';
      resource:
        | { text: string; uri: string; mimeType?: string }
        | { uri: string; blob: string; mimeType?: string };
    };

/**
 * Result type for tool execution (MCP compatible)
 */
export interface ToolResult {
  [x: string]: unknown;
  content: ToolResultContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/**
 * Tool handler function type
 * Takes parsed arguments and returns a tool result
 */
export type ToolHandler<T = Record<string, unknown>> = (
  args: T,
) => Promise<ToolResult>;

/**
 * Tool schema type using Zod
 */
export type ToolSchema = Record<string, z.ZodTypeAny>;

/**
 * Tool definition for MCP server
 */
export interface ToolDefinition<T = Record<string, unknown>> {
  name: string;
  description: string;
  schema: ToolSchema;
  handler: ToolHandler<T>;
  autoDestroy?: boolean;
}

/**
 * Action space item definition
 * Note: Intentionally no index signature to maintain compatibility with DeviceAction
 */
export interface ActionSpaceItem {
  name: string;
  description?: string;
  args?: Record<string, unknown>;
  paramSchema?: z.ZodTypeAny;
}

/**
 * Base agent interface
 * Represents a platform-specific agent (Android, iOS, Web)
 * Note: Return types use `unknown` for compatibility with platform-specific implementations
 */
export interface BaseAgent {
  getActionSpace(): Promise<ActionSpaceItem[]>;
  destroy?(): Promise<void>;
  page?: {
    screenshotBase64(): Promise<string>;
  };
  aiAction?: (
    description: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  aiWaitFor?: (
    assertion: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
}

/**
 * Base device interface for temporary device instances
 */
export interface BaseDevice {
  actionSpace(): ActionSpaceItem[];
  destroy?(): Promise<void>;
}

/**
 * Interface for platform-specific MCP tools manager
 */
export interface IMidsceneTools {
  attachToServer(server: McpServer): void;
  initTools(): Promise<void>;
  closeBrowser?(): Promise<void>;
}
