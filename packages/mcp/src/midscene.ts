import {
  AndroidAgent,
  AndroidDevice,
  getConnectedDevices,
} from '@midscene/android';
import type { DeviceAction } from '@midscene/core';
import {
  MIDSCENE_MCP_ANDROID_MODE,
  MIDSCENE_MCP_USE_PUPPETEER_MODE,
  globalConfigManager,
} from '@midscene/shared/env';
import { parseBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PuppeteerBrowserAgent, ensureBrowser } from './puppeteer';
import { tools } from './tools';

declare global {
  interface Window {
    mcpHelper?: {
      logs: string[];
      originalConsole: Partial<typeof console>;
    };
  }
}

const debug = getDebug('mcp:tools');

/**
 * Tool definition interface for caching prepared tool configurations
 */
interface ToolDefinition {
  name: string;
  description: string;
  schema: any;
  handler: (...args: any[]) => Promise<any>;
  autoDestroy?: boolean; // Whether to auto destroy agent after execution
}

export class MidsceneManager {
  private mcpServer?: McpServer; // Add server instance
  private agent?: AgentOverChromeBridge | PuppeteerBrowserAgent | AndroidAgent;
  private puppeteerMode = globalConfigManager.getEnvConfigInBoolean(
    MIDSCENE_MCP_USE_PUPPETEER_MODE,
  );
  private androidMode = globalConfigManager.getEnvConfigInBoolean(
    MIDSCENE_MCP_ANDROID_MODE,
  ); // Add Android mode flag
  private androidDeviceId?: string; // Add device ID storage
  private toolDefinitions: ToolDefinition[] = []; // Store all tool definitions

  /**
   * Attach this manager to an MCP server instance and register all tools.
   * This method must be called after initTools.
   */
  public attachToServer(server: McpServer): void {
    this.mcpServer = server;

    if (this.toolDefinitions.length === 0) {
      throw new Error(
        'No tool definitions found. Call initTools() before attachToServer().',
      );
    }

    // Register all cached tool definitions
    for (const toolDef of this.toolDefinitions) {
      if (toolDef.autoDestroy) {
        this.toolWithAutoDestroy(
          toolDef.name,
          toolDef.description,
          toolDef.schema,
          toolDef.handler,
        );
      } else {
        // Register without auto-destroy wrapper
        this.mcpServer.tool(
          toolDef.name,
          toolDef.description,
          toolDef.schema,
          toolDef.handler,
        );
      }
    }

    debug('Registered', this.toolDefinitions.length, 'tools with MCP server');
  }

  // initializes or re-initializes the browser agent.
  private async ensureAgent(openNewTabWithUrl?: string) {
    // re-init the agent if url is provided
    if (this.agent && openNewTabWithUrl) {
      try {
        await this.agent.destroy();
      } catch (e) {
        // console.error('failed to destroy agent', e);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Check if running in Android mode or bridge mode
    if (this.androidMode) {
      this.agent = await this.initAndroidAgent(openNewTabWithUrl);
    } else if (!this.puppeteerMode) {
      this.agent = await this.initAgentByBridgeMode(openNewTabWithUrl);
    } else {
      this.agent = await this.initPuppeteerAgent(openNewTabWithUrl);
    }

    return this.agent;
  }

  private async initAgentByBridgeMode(
    openNewTabWithUrl?: string,
  ): Promise<AgentOverChromeBridge> {
    let agent: AgentOverChromeBridge;
    try {
      // Create a new agent instance designed for bridge mode.
      agent = new AgentOverChromeBridge({
        closeConflictServer: true,
      });
      // If this is the first initialization (not re-init),
      if (!openNewTabWithUrl) {
        // Connect the agent to the currently active tab in the browser.
        await agent.connectCurrentTab();
      } else {
        await agent.connectNewTabWithUrl(openNewTabWithUrl);
      }
      return agent;
    } catch (err) {
      //@ts-ignore
      if (agent) {
        await agent.destroy();
      }
      console.error('Bridge mode connection failed', err);
      // Check if we've exceeded the maximum retry attempts
      throw new Error(
        'Unable to establish Bridge mode connection. Please check the following issues:\n' +
          '1. Confirm Chrome browser is running\n' +
          '2. Midscene extension is properly installed in Chrome\n' +
          '3. Bridge mode is enabled in the extension settings\n' +
          '4. No other MCP clients are using the Midscene MCP server',
      );
    }
  }

  private async initPuppeteerAgent(openNewTabWithUrl?: string) {
    // If not in bridge mode, use Puppeteer to control a browser instance.
    // Ensure a Puppeteer browser instance is running and get its details.
    const { browser } = await ensureBrowser({});
    // Create a new, blank page (tab) in the browser.
    const newPage = await browser.newPage();

    // Navigate the new page to Google as a starting point.
    if (openNewTabWithUrl) {
      await newPage.goto(openNewTabWithUrl);
    } else {
      await newPage.goto('https://google.com');
    }
    // Create a new Puppeteer-specific agent instance, controlling the browser and the new page.
    const agent = new PuppeteerBrowserAgent(browser, newPage);
    return agent;
  }

  private async initAndroidAgent(uri?: string): Promise<AndroidAgent> {
    try {
      let deviceId = this.androidDeviceId;

      // If no device ID is specified, get the first connected device
      if (!deviceId) {
        const devices = await getConnectedDevices();
        if (devices.length === 0) {
          throw new Error(
            'No Android devices connected. Please connect a device via ADB.',
          );
        }
        deviceId = devices[0].udid;
        this.androidDeviceId = deviceId;
      }

      // Create an Android device instance
      const androidDevice = new AndroidDevice(deviceId, {
        autoDismissKeyboard: true,
        imeStrategy: 'yadb-for-non-ascii',
      });

      // Connect to the device
      await androidDevice.connect();

      // If a URI is provided, launch the app or web page
      if (uri) {
        await androidDevice.launch(uri);
      }

      // Create an Android Agent
      const agent = new AndroidAgent(androidDevice, {
        aiActionContext:
          'If any permission dialog appears, click Allow. If login page appears, close it.',
      });

      return agent;
    } catch (err) {
      console.error('Android mode connection failed', err);
      throw new Error(
        'Unable to establish Android connection. Please check the following:\n' +
          '1. Android device is connected via ADB\n' +
          '2. USB debugging is enabled on the device\n' +
          '3. Device is unlocked and authorized for debugging\n' +
          '4. ADB is properly installed and accessible',
      );
    }
  }

  /**
   * Prepare Android-specific tool definitions
   * This method creates tool definitions that are specific to Android automation
   */
  private prepareAndroidToolDefinitions(): ToolDefinition[] {
    return [
      // Android device connection tool
      {
        name: 'midscene_android_connect',
        description: 'Connect to an Android device via ADB',
        schema: {
          deviceId: z
            .string()
            .optional()
            .describe(
              'Device ID to connect to. If not provided, uses the first available device.',
            ),
        },
        handler: async ({ deviceId }) => {
          this.androidDeviceId = deviceId;
          this.agent = undefined; // Reset the agent to force reinitialization
          await this.ensureAgent();
          return {
            content: [
              {
                type: 'text',
                text: `Connected to Android device: ${this.androidDeviceId}`,
              },
            ],
            isError: false,
          };
        },
        autoDestroy: true,
      },
      // Android device list tool
      {
        name: 'midscene_android_list_devices',
        description: 'List all connected Android devices',
        schema: {},
        handler: async () => {
          const devices = await getConnectedDevices();
          return {
            content: [
              {
                type: 'text',
                text: `Connected Android devices:\n${JSON.stringify(devices, null, 2)}`,
              },
            ],
            isError: false,
          };
        },
        autoDestroy: false, // No agent needed, no auto destroy
      },
    ];
  }

  /**
   * Prepare common tool definitions (aiWaitFor, aiAssert, screenshot)
   */
  private prepareCommonToolDefinitions(): ToolDefinition[] {
    return [
      // aiWaitFor tool
      {
        name: tools.midscene_aiWaitFor.name,
        description: tools.midscene_aiWaitFor.description,
        schema: {
          assertion: z
            .string()
            .describe(
              'Condition to monitor on the page, described in natural language.',
            ),
          timeoutMs: z
            .number()
            .optional()
            .default(15000)
            .describe('Maximum time to wait (ms).\nDefault: 15000'),
          checkIntervalMs: z
            .number()
            .optional()
            .default(3000)
            .describe('How often to check the condition (ms).\nDefault: 3000'),
        },
        handler: async ({ assertion, timeoutMs, checkIntervalMs }) => {
          const agent = await this.ensureAgent();
          await agent.aiWaitFor(assertion, {
            timeoutMs,
            checkIntervalMs,
          });
          return {
            content: [
              { type: 'text', text: `Wait condition met: "${assertion}"` },
            ],
          };
        },
        autoDestroy: true,
      },
      // aiAssert tool
      {
        name: tools.midscene_aiAssert.name,
        description: tools.midscene_aiAssert.description,
        schema: {
          assertion: z
            .string()
            .describe(
              'Condition to monitor on the page, described in natural language.',
            ),
        },
        handler: async ({ assertion }) => {
          const agent = await this.ensureAgent();
          await agent.aiAssert(assertion);
          return {
            content: [
              { type: 'text', text: `Assert condition : "${assertion}"` },
            ],
          };
        },
        autoDestroy: true,
      },
      // Screenshot tool
      {
        name: tools.midscene_screenshot.name,
        description: tools.midscene_screenshot.description,
        schema: {},
        handler: async () => {
          const agent = await this.ensureAgent();
          const screenshot = await agent.page.screenshotBase64();

          const { mimeType, body } = parseBase64(screenshot);

          return {
            content: [
              {
                type: 'image',
                data: body,
                mimeType,
              } as ImageContent,
            ],
            isError: false,
          };
        },
        autoDestroy: true,
      },
    ];
  }

  /**
   * Prepare dynamic action space tool definitions
   */
  private prepareActionSpaceToolDefinitions(
    actionSpace: DeviceAction<any, any>[],
  ): ToolDefinition[] {
    const tools = actionSpace.map((action) => ({
      name: action.name,
      description: `Ask Midscene (a helper that can understand natural language and perform actions) to perform the action "${action.name}", this action is defined as follows: ${action.description || 'No description provided'}.`,
      schema: {
        instruction: z
          .string()
          .describe('The detailed instruction on how to perform the action'),
      },
      handler: async ({ instruction }: { instruction: string }) => {
        const agent = await this.ensureAgent();
        await agent.aiAct(
          `Use the action "${action.name}" to do this: ${instruction}`,
        );
        const screenshot = await agent.page.screenshotBase64();
        const { mimeType, body } = parseBase64(screenshot);
        return {
          content: [
            {
              type: 'text',
              text: `Action performed, the report is: ${agent.reportFile} , and i will give you the screenshot after taking it`,
            } as TextContent,
            {
              type: 'image',
              data: body,
              mimeType,
            } as ImageContent,
          ],
          isError: false,
        };
      },
      autoDestroy: true,
    }));
    return tools;
  }

  /**
   * Initialize tools by preparing all tool definitions.
   * This method is async and should be called before registerTools.
   * It's independent of the MCP server.
   */
  public async initTools() {
    // Clear existing definitions
    this.toolDefinitions = [];

    // Prepare Android tools if in Android mode
    if (this.androidMode) {
      const androidTools = this.prepareAndroidToolDefinitions();
      this.toolDefinitions.push(...androidTools);
    }

    // Prepare dynamic action space tools
    const agent = await this.ensureAgent();
    const actionSpace = await agent.getActionSpace();
    const actionTools = this.prepareActionSpaceToolDefinitions(actionSpace);
    this.toolDefinitions.push(...actionTools);

    // Prepare common tools
    const commonTools = this.prepareCommonToolDefinitions();
    this.toolDefinitions.push(...commonTools);

    // List all the tools in the toolDefinitions array
    debug(
      'Tool definitions:',
      this.toolDefinitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    );
    debug('Total tool definitions prepared:', this.toolDefinitions.length);
  }

  public async closeBrowser(): Promise<void> {
    await this.agent?.destroy();
  }

  /**
   * Wrapper for tool registration that automatically destroys the agent after each tool call.
   * This ensures each tool call starts with a fresh agent instance and prevents connection leaks.
   *
   * Usage: Replace `this.mcpServer.tool(...)` with `this.toolWithAutoDestroy(...)`
   */
  private toolWithAutoDestroy(
    name: string,
    description: string,
    schema: any,
    handler: (...args: any[]) => Promise<any>,
  ) {
    if (!this.mcpServer) {
      throw new Error('MCP server not attached');
    }
    this.mcpServer.tool(name, description, schema, async (...args: any[]) => {
      try {
        return await handler(...args);
      } finally {
        // Always destroy agent after tool execution
        if (!process.env.MIDSCENE_MCP_DISABLE_AGENT_AUTO_DESTROY) {
          try {
            await this.agent?.destroy();
          } catch (e) {
            // Ignore destroy errors to prevent them from masking the actual result
            // console.error('Error destroying agent:', e);
          }
          this.agent = undefined;
        }
      }
    });
  }
}
