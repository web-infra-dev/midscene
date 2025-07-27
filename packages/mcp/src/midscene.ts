import { appendFileSync } from 'node:fs';
import {
  MIDSCENE_MCP_USE_PUPPETEER_MODE,
  getAIConfigInBoolean,
} from '@midscene/shared/env';
import {
  AgentOverChromeBridge,
  allConfigFromEnv,
  overrideAIConfig,
} from '@midscene/web/bridge-mode';
// Add Android-related imports
import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
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

export class MidsceneManager {
  private consoleLogs: string[] = [];
  private screenshots = new Map<string, string>();
  private mcpServer: McpServer; // Add server instance
  private agent?: AgentOverChromeBridge | PuppeteerBrowserAgent | AndroidAgent;
  private puppeteerMode = getAIConfigInBoolean(MIDSCENE_MCP_USE_PUPPETEER_MODE);
  private androidMode = getAIConfigInBoolean('MIDSCENE_MCP_USE_ANDROID_MODE'); // Add Android mode flag
  private androidDeviceId?: string; // Add device ID storage
  constructor(server: McpServer) {
    this.mcpServer = server;
    this.initEnv();
    this.registerTools();
  }

  private initEnv() {
    const keys = Object.keys(allConfigFromEnv());
    const envOverrides: { [key: string]: string } = {};
    for (const key of keys) {
      const value = process.env[key];
      if (value !== undefined) {
        envOverrides[key] = value;
      }
    }
    overrideAIConfig(envOverrides);
  }

  // initializes or re-initializes the browser agent.
  private async initAgent(openNewTabWithUrl?: string) {
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
        const tabsInfo = await agent.getBrowserTabList();
        // Send active tab information in a well-structured format
        this.sendActiveTabInfo(tabsInfo);
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
        throw new Error('No Android devices connected. Please connect a device via ADB.');  
      }  
      deviceId = devices[0].udid;  
      this.androidDeviceId = deviceId;  
    }  
  
    // Create an Android device instance  
    const androidDevice = new AndroidDevice(deviceId, {  
      autoDismissKeyboard: true,  
      imeStrategy: 'yadb-for-non-ascii'  
    });  
  
    // Connect to the device  
    await androidDevice.connect();  
  
    // If a URI is provided, launch the app or web page  
    if (uri) {  
      await androidDevice.launch(uri);  
    }  
  
    // Create an Android Agent  
    const agent = new AndroidAgent(androidDevice, {  
      aiActionContext: 'If any permission dialog appears, click Allow. If login page appears, close it.'  
    });  
  
    return agent;  
    } catch (err) {  
      console.error('Android mode connection failed', err);  
      throw new Error(  
        'Unable to establish Android connection. Please check the following:\n' +  
        '1. Android device is connected via ADB\n' +  
        '2. USB debugging is enabled on the device\n' +  
        '3. Device is unlocked and authorized for debugging\n' +  
        '4. ADB is properly installed and accessible'  
      );  
    }  
  }

  /**
   * Register Android-specific tools
   * This method registers all tools that are specific to Android automation
   */
  private registerAndroidTool() {
    // Android device connection tool
    this.mcpServer.tool(
      'midscene_android_connect',
      'Connect to an Android device via ADB',
      {
        deviceId: z.string().optional().describe('Device ID to connect to. If not provided, uses the first available device.'),
      },
      async ({ deviceId }) => {
        this.androidDeviceId = deviceId;
        this.agent = undefined; // Reset the agent to force reinitialization
        const agent = await this.initAgent();
        
        return {
          content: [
            { type: 'text', text: `Connected to Android device: ${this.androidDeviceId}` },
          ],
          isError: false,
        };
      },
    );
    
    // Android app launch tool
    this.mcpServer.tool(
      'midscene_android_launch',
      'Launch an app or navigate to a URL on Android device',
      {
        uri: z.string().describe('Package name, activity name, or URL to launch'),
      },
      async ({ uri }) => {
        const agent = await this.initAgent();
        if (agent instanceof AndroidAgent) {
          try {
            await agent.launch(uri);
            return {
              content: [
                { type: 'text', text: `Launched: ${uri}` },
              ],
              isError: false,
            };
          } catch (error: any) {
            // Capture and return a more user-friendly error message
            return {
              content: [
                { type: 'text', text: `Failed to launch: ${uri}: ${error.message}` },
              ],
              isError: true,
            };
          }
        } else {
          throw new Error('Android mode is not enabled. Set MIDSCENE_MCP_USE_ANDROID_MODE=true');
        }
      },
    );
    
    // Android device list tool
    this.mcpServer.tool(
      'midscene_android_list_devices',
      'List all connected Android devices',
      {},
      async () => {
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
    );
    
    // Android back button tool
    this.mcpServer.tool(
      'midscene_android_back',
      'Press the back button on Android device',
      {},
      async () => {
        const agent = await this.initAgent();
        if (agent instanceof AndroidAgent) {
          await agent.page.back();
          return {
            content: [
              { type: 'text', text: 'Pressed back button' },
            ],
            isError: false,
          };
        } else {
          throw new Error('Android mode is not enabled');
        }
      },
    );
    
    // Android Home button tool
    this.mcpServer.tool(
      'midscene_android_home',  
      'Press the home button on Android device',
      {},
      async () => {
        const agent = await this.initAgent();
        if (agent instanceof AndroidAgent) {
          await agent.page.home();
          return {
            content: [
              { type: 'text', text: 'Pressed home button' },
            ],
            isError: false,
          };
        } else {
          throw new Error('Android mode is not enabled');
        }
      },
    );
  }

  /**
   * Register browser-specific tools
   * This method registers all tools that are specific to browser automation
   */
  private registerBrowserTool() {
    this.mcpServer.tool(
      tools.midscene_navigate.name,
      tools.midscene_navigate.description,
      {
        url: z.string().describe('URL to navigate to'),
      },
      async ({ url }) => {
        await this.initAgent(url);
        return {
          content: [
            {
              type: 'text',
              text: `Navigated to ${url}`,
            },
          ],
          isError: false,
        };
      },
    );

    this.mcpServer.tool(
      tools.midscene_get_tabs.name,
      tools.midscene_get_tabs.description,
      {},
      async () => {
        const agent = await this.initAgent();
        if ('getBrowserTabList' in agent) {
          const tabsInfo = await agent.getBrowserTabList();
          return {
            content: [
              {
                type: 'text',
                text: `Current Tabs:\n${JSON.stringify(tabsInfo, null, 2)}`,
              },
            ],
            isError: false,
          };
        } else {
          // Tab management is not supported in Android mode
          throw new Error('Tab management is not supported in Android mode');
        }
      },
    );

    this.mcpServer.tool(
      tools.midscene_set_active_tab.name,
      tools.midscene_set_active_tab.description,
      { tabId: z.string().describe('The ID of the tab to set as active.') },
      async ({ tabId }) => {
        const agent = await this.initAgent();
        // Add type checking
        if ('setActiveTabId' in agent) {
          await agent.setActiveTabId(tabId);
          return {
            content: [{ type: 'text', text: `Set active tab to ${tabId}` }],
            isError: false,
          };
        } else {
          // Tab switching is not supported in Android mode
          throw new Error('Tab switching is not supported in Android mode');
        }
      },
    );

    this.mcpServer.tool(
      tools.midscene_aiHover.name,
      tools.midscene_aiHover.description,
      {
        locate: z
          .string()
          .describe('Use natural language describe the element to hover over'),
      },
      async ({ locate }) => {
        const agent = await this.initAgent();
        await agent.aiHover(locate);
        return {
          content: [
            { type: 'text', text: `Hovered over ${locate}` },
            { type: 'text', text: `report file: ${agent.reportFile}` },
          ],
          isError: false,
        };
      },
    );
  }

  private registerTools() {
    // Register mode-specific tools
    if (this.androidMode) {
      this.registerAndroidTool();
    } else {
      this.registerBrowserTool();
    }

    // Register common tools available in both modes
    this.mcpServer.tool(
      tools.midscene_aiWaitFor.name,
      tools.midscene_aiWaitFor.description,
      {
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
      async ({ assertion, timeoutMs, checkIntervalMs }) => {
        const agent = await this.initAgent();
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
    );

    this.mcpServer.tool(
      tools.midscene_aiAssert.name,
      tools.midscene_aiAssert.description,
      {
        assertion: z
          .string()
          .describe(
            'Condition to monitor on the page, described in natural language.',
          ),
      },
      async ({ assertion }) => {
        const agent = await this.initAgent();
        await agent.aiAssert(assertion);
        return {
          content: [
            { type: 'text', text: `Assert condition : "${assertion}"` },
          ],
        };
      },
    );

    this.mcpServer.tool(
      tools.midscene_aiKeyboardPress.name,
      tools.midscene_aiKeyboardPress.description,
      {
        key: z
          .string()
          .describe(
            "The web key to press, e.g. 'Enter', 'Tab', 'Escape', etc.",
          ),
        locate: z
          .string()
          .optional()
          .describe(
            'Optional: natural language description of the element to press the key on',
          ),
        deepThink: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, uses a two-step AI call to precisely locate the element',
          ),
      },
      async ({ key, locate, deepThink }) => {
        const agent = await this.initAgent();
        const options = deepThink ? { deepThink } : undefined;
        await agent.aiKeyboardPress(key, locate, options);

        const targetDesc = locate ? ` on element "${locate}"` : '';

        return {
          content: [
            { type: 'text', text: `Pressed key '${key}'${targetDesc}` },
            { type: 'text', text: `report file: ${agent.reportFile}` },
          ],
          isError: false,
        };
      },
    );

    this.mcpServer.tool(
      tools.midscene_screenshot.name,
      tools.midscene_screenshot.description,
      {
        name: z.string().describe('Name for the screenshot'),
      },
      async ({ name }) => {
        const agent = await this.initAgent();
        const screenshot = await agent.page.screenshotBase64();
        // Remove the data URL prefix if present
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');

        this.screenshots.set(name, screenshot as string);

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot '${name}' taken at 1200x800`,
            } as TextContent,
            {
              type: 'image',
              data: base64Data,
              mimeType: 'image/jpeg',
            } as ImageContent,
          ],
          isError: false,
        };
      },
    );

    this.mcpServer.tool(
      tools.midscene_aiTap.name,
      tools.midscene_aiTap.description,
      {
        locate: z
          .string()
          .describe('Use natural language describe the element to click'),
      },
      async ({ locate }) => {
        const agent = await this.initAgent();
        await agent.aiTap(locate);
        return {
          content: [
            { type: 'text', text: `Clicked on ${locate}` },
            { type: 'text', text: `report file: ${agent.reportFile}` },
          ],
          isError: false,
        };
      },
    );

    this.mcpServer.tool(
      tools.midscene_aiScroll.name,
      tools.midscene_aiScroll.description,
      {
        direction: z
          .enum(['up', 'down', 'left', 'right'])
          .describe('The direction to scroll.'),
        scrollType: z
          .enum(['once', 'untilBottom', 'untilTop', 'untilLeft', 'untilRight'])
          .optional()
          .default('once')
          .describe(
            "Type of scroll: 'once' for a fixed distance, or until reaching an edge.",
          ),
        distance: z
          .number()
          .optional()
          .describe(
            "The distance to scroll in pixels (used with scrollType 'once').",
          ),
        locate: z
          .string()
          .optional()
          .describe(
            'Optional natural language description of the element to scroll. If not provided, scrolls based on current mouse position.',
          ),
        deepThink: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true and 'locate' is provided, uses a two-step AI call to precisely locate the element.",
          ),
      },
      async ({ direction, scrollType, distance, locate, deepThink }) => {
        const agent = await this.initAgent();
        const scrollParam = { direction, scrollType, distance };
        await agent.aiScroll(scrollParam, locate, { deepThink });
        const targetDesc = locate
          ? ` element described by: "${locate}"`
          : ' the page';
        return {
          content: [
            { type: 'text', text: `Scrolled${targetDesc} ${direction}.` },
            { type: 'text', text: `report file: ${agent.reportFile}` },
          ],
        };
      },
    );

    this.mcpServer.tool(
      tools.midscene_aiInput.name,
      tools.midscene_aiInput.description,
      {
        value: z.string().describe('The text to input'),
        locate: z
          .string()
          .describe(
            'Describe the element to input text into, use natural language',
          ),
      },
      async ({ value, locate }) => {
        const agent = await this.initAgent();
        await agent.aiInput(value, locate);
        return {
          content: [
            { type: 'text', text: `Inputted ${value} into ${locate}` },
            { type: 'text', text: `report file: ${agent.reportFile}` },
          ],
          isError: false,
        };
      },
    );
  }

  public getConsoleLogs(): string {
    return this.consoleLogs.join('\n');
  }

  public getScreenshot(name: string): string | undefined {
    return this.screenshots.get(name);
  }

  public listScreenshotNames(): string[] {
    return Array.from(this.screenshots.keys());
  }

  public async closeBrowser(): Promise<void> {
    await this.agent?.destroy();
  }

  /**
   * Sends active tab information to the LLM in a well-structured format
   * @param tabsInfo Array of browser tabs
   * @returns The active tab if found, otherwise undefined
   */
  private sendActiveTabInfo(
    tabsInfo: Array<{
      id: string;
      title: string;
      url: string;
      currentActiveTab?: boolean;
    }>,
  ): void {
    try {
      // Find the active tab with proper null checking
      const activeTab = tabsInfo?.find((tab) => tab.currentActiveTab === true);

      if (!activeTab) {
        return;
      }

      // Format the tab information for better readability
      const formattedInfo = {
        id: activeTab.id,
        title: activeTab.title,
        url: activeTab.url,
        timestamp: new Date().toISOString(),
      };

      // Send notification with well-formatted active tab info 
      this.mcpServer.server.notification({
        method: 'activeTabInfo',
        params: {
          type: 'text',
          text: `Active Tab Information:
ID: ${formattedInfo.id}
Title: ${formattedInfo.title}
URL: ${formattedInfo.url}`,
        },
      });
    } catch (error) {}
  }
}
