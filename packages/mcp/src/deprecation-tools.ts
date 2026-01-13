import { z } from '@midscene/core';
import {
  type BaseAgent,
  BaseMidsceneTools,
  type ToolDefinition,
} from '@midscene/shared/mcp';

const DEPRECATION_MESSAGE = `
⚠️ DEPRECATION NOTICE ⚠️

The @midscene/mcp package is deprecated and no longer maintained.

Please migrate to one of the platform-specific MCP packages:
  • @midscene/web-bridge-mcp - For web browser automation (Bridge mode)
  • @midscene/android-mcp - For Android device automation
  • @midscene/ios-mcp - For iOS device automation

These new packages provide better performance, stability, and platform-specific features.

Migration Guide:
1. Uninstall @midscene/mcp
2. Install the appropriate platform-specific package
3. Update your MCP configuration to use the new package name

For more information, visit: https://midscenejs.com/mcp-migration
`;

/**
 * Mock tools definitions that will return deprecation notices
 */
export const tools = {
  // Common tools
  wait_for: {
    name: 'wait_for',
    description:
      'DEPRECATED: Waits until a specified condition, described in natural language, becomes true on the page. Use platform-specific MCP packages instead.',
  },
  assert: {
    name: 'assert',
    description:
      'DEPRECATED: Asserts that a specified condition, described in natural language, is true on the page. Use platform-specific MCP packages instead.',
  },
  take_screenshot: {
    name: 'take_screenshot',
    description:
      'DEPRECATED: Captures a screenshot of the currently active page. Use platform-specific MCP packages instead.',
  },

  // Web-specific tools
  web_connect: {
    name: 'web_connect',
    description:
      'DEPRECATED: Connect to web page by opening new tab with URL. Use @midscene/web-bridge-mcp instead.',
  },

  // Android-specific tools
  midscene_android_connect: {
    name: 'midscene_android_connect',
    description:
      'DEPRECATED: Connect to an Android device via ADB for automation. Use @midscene/android-mcp instead.',
  },
  midscene_android_list_devices: {
    name: 'midscene_android_list_devices',
    description:
      'DEPRECATED: List all connected Android devices available for automation. Use @midscene/android-mcp instead.',
  },

  // iOS-specific tools
  midscene_ios_connect: {
    name: 'midscene_ios_connect',
    description:
      'DEPRECATED: Connect to an iOS device via WebDriverAgent for automation. Use @midscene/ios-mcp instead.',
  },
  midscene_ios_list_devices: {
    name: 'midscene_ios_list_devices',
    description:
      'DEPRECATED: List all connected iOS devices available for automation. Use @midscene/ios-mcp instead.',
  },

  // AI methods from Agent class
  aiTap: {
    name: 'aiTap',
    description:
      'DEPRECATED: AI-powered tap/click action on elements. Use platform-specific MCP packages instead.',
  },
  aiRightClick: {
    name: 'aiRightClick',
    description:
      'DEPRECATED: AI-powered right-click action on elements. Use platform-specific MCP packages instead.',
  },
  aiDoubleClick: {
    name: 'aiDoubleClick',
    description:
      'DEPRECATED: AI-powered double-click action on elements. Use platform-specific MCP packages instead.',
  },
  aiHover: {
    name: 'aiHover',
    description:
      'DEPRECATED: AI-powered hover action on elements. Use platform-specific MCP packages instead.',
  },
  aiInput: {
    name: 'aiInput',
    description:
      'DEPRECATED: AI-powered input text into form fields. Use platform-specific MCP packages instead.',
  },
  aiKeyboardPress: {
    name: 'aiKeyboardPress',
    description:
      'DEPRECATED: AI-powered keyboard press action. Use platform-specific MCP packages instead.',
  },
  aiScroll: {
    name: 'aiScroll',
    description:
      'DEPRECATED: AI-powered scroll action on page or elements. Use platform-specific MCP packages instead.',
  },
  aiAct: {
    name: 'aiAct',
    description:
      'DEPRECATED: AI-powered natural language action execution. Use platform-specific MCP packages instead.',
  },
  aiAction: {
    name: 'aiAction',
    description:
      'DEPRECATED: Alias for aiAct. Use platform-specific MCP packages instead.',
  },
  aiQuery: {
    name: 'aiQuery',
    description:
      'DEPRECATED: AI-powered data extraction from the page. Use platform-specific MCP packages instead.',
  },
  aiBoolean: {
    name: 'aiBoolean',
    description:
      'DEPRECATED: AI-powered boolean query from the page. Use platform-specific MCP packages instead.',
  },
  aiNumber: {
    name: 'aiNumber',
    description:
      'DEPRECATED: AI-powered number extraction from the page. Use platform-specific MCP packages instead.',
  },
  aiString: {
    name: 'aiString',
    description:
      'DEPRECATED: AI-powered string extraction from the page. Use platform-specific MCP packages instead.',
  },
  aiAsk: {
    name: 'aiAsk',
    description:
      'DEPRECATED: AI-powered question answering from the page. Use platform-specific MCP packages instead.',
  },
  aiLocate: {
    name: 'aiLocate',
    description:
      'DEPRECATED: AI-powered element location on the page. Use platform-specific MCP packages instead.',
  },
  aiAssert: {
    name: 'aiAssert',
    description:
      'DEPRECATED: AI-powered assertion on page state. Use platform-specific MCP packages instead.',
  },
  aiWaitFor: {
    name: 'aiWaitFor',
    description:
      'DEPRECATED: AI-powered wait for condition to be true. Use platform-specific MCP packages instead.',
  },
  ai: {
    name: 'ai',
    description:
      'DEPRECATED: Shorthand for aiAct. Use platform-specific MCP packages instead.',
  },
};

/**
 * Deprecation tools manager that registers mock tools
 * All tools return deprecation notices
 */
export class DeprecationMidsceneTools extends BaseMidsceneTools {
  protected createTemporaryDevice() {
    // Return a minimal mock device that satisfies the interface
    // This device is never actually used since all tools return deprecation messages
    return {
      async getActionSpace() {
        return [];
      },
    } as any;
  }

  protected async ensureAgent(_initParam?: string): Promise<BaseAgent> {
    // Return a minimal mock agent
    // This agent is never actually used since all tools return deprecation messages
    return {
      async getActionSpace() {
        return [];
      },
    } as BaseAgent;
  }

  protected preparePlatformTools(): ToolDefinition[] {
    // Convert tools object to ToolDefinition array
    return Object.values(tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: {
        _deprecated: z.boolean().optional().describe('This tool is deprecated'),
      },
      handler: async () => ({
        content: [
          {
            type: 'text' as const,
            text: DEPRECATION_MESSAGE,
          },
        ],
      }),
    }));
  }
}
