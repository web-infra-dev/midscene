import { z } from '@midscene/core';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { AgentOverChromeBridge } from './bridge-mode';
import { StaticPage } from './static';

/**
 * Tools manager for Web bridge-mode MCP
 */
export class WebMidsceneTools extends BaseMidsceneTools<AgentOverChromeBridge> {
  protected createTemporaryDevice() {
    // Use require to avoid type incompatibility with DeviceAction vs ActionSpaceItem
    // StaticPage.actionSpace() returns DeviceAction[] which is compatible at runtime
    // Use screenshotBase64 field to avoid async ScreenshotItem.create()
    return new StaticPage({
      screenshotBase64: '',
      shotSize: { width: 1920, height: 1080 },
    });
  }

  protected async ensureAgent(
    openNewTabWithUrl?: string,
  ): Promise<AgentOverChromeBridge> {
    // Re-init if URL provided
    if (this.agent && openNewTabWithUrl) {
      try {
        await this.agent?.destroy?.();
      } catch (error) {
        console.debug('Failed to destroy agent during re-init:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Bridge mode requires a URL to connect to browser
    if (!openNewTabWithUrl) {
      throw new Error(
        'Bridge mode requires a URL. Use web_connect tool to connect to a page first.',
      );
    }

    this.agent = await this.initBridgeModeAgent(openNewTabWithUrl);

    return this.agent;
  }

  private async initBridgeModeAgent(
    url?: string,
  ): Promise<AgentOverChromeBridge> {
    const agent = new AgentOverChromeBridge({ closeConflictServer: true });

    if (!url) {
      await agent.connectCurrentTab();
    } else {
      await agent.connectNewTabWithUrl(url);
    }

    return agent;
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'web_connect',
        description: 'Connect to web page by opening new tab with URL',
        schema: {
          url: z.string().url().describe('URL to connect to'),
        },
        handler: async (args) => {
          const { url } = args as { url: string };
          const agent = await this.ensureAgent(url);
          const screenshot = await agent.page?.screenshotBase64();
          if (!screenshot) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Connected to: ${url}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Connected to: ${url}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
          };
        },
      },
      {
        name: 'web_disconnect',
        description:
          'Disconnect from current web page and release browser resources',
        schema: {},
        handler: this.createDisconnectHandler('web page'),
      },
    ];
  }
}
