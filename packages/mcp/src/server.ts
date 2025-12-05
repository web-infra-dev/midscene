import { BaseMCPServer } from '@midscene/shared/mcp';
import { DeprecationMidsceneTools } from './deprecation-tools.js';

declare const __VERSION__: string;

/**
 * Deprecated MCP Server class
 * This package is deprecated. Please use platform-specific packages instead:
 * - @midscene/web-bridge-mcp for web automation
 * - @midscene/android-mcp for Android automation
 * - @midscene/ios-mcp for iOS automation
 */
export class DeprecatedMCPServer extends BaseMCPServer {
  constructor() {
    super({
      name: '@midscene/mcp',
      version: __VERSION__,
      description:
        'Deprecated - Use @midscene/web-bridge-mcp, @midscene/android-mcp, or @midscene/ios-mcp',
    });
  }

  protected createToolsManager(): DeprecationMidsceneTools {
    return new DeprecationMidsceneTools();
  }
}
