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
      size: { width: 1920, height: 1080 },
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

    // Connect to current tab when no URL provided (handles CLI stateless calls)
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
        description:
          'Connect to web page. If URL provided, opens new tab; otherwise connects to current tab.',
        schema: {
          url: z
            .string()
            .url()
            .optional()
            .describe('URL to open in new tab (omit to connect current tab)'),
        },
        handler: async (args) => {
          const { url } = args as { url?: string };

          // Bypass ensureAgent's URL check — directly init bridge agent
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
          }
          this.agent = await this.initBridgeModeAgent(url);

          const screenshot = await this.agent.page?.screenshotBase64();
          const label = url ?? 'current tab';

          return {
            content: [
              { type: 'text', text: `Connected to: ${label}` },
              ...(screenshot
                ? this.buildScreenshotContent(screenshot)
                : []),
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
