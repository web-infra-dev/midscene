import { ScreenshotItem } from '@midscene/core';
import {
  extractAgentBehaviorInitArgs,
  getAgentInitArgsSignature,
  shouldRebuildAgentForInitArgs,
} from '@midscene/shared/mcp/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { AgentOverChromeBridge } from './bridge-mode';
import { defaultStaticPageViewportSize } from './common/viewport';
import {
  type WebAgentInitArgs,
  adaptWebAgentInitArgs,
  webAgentInitArgShape,
} from './mcp-agent-init-args';
import { StaticPage } from './static';

/**
 * Tools manager for Web bridge-mode MCP
 */
export class WebMidsceneTools extends BaseMidsceneTools<
  AgentOverChromeBridge,
  WebAgentInitArgs
> {
  private lastInitArgsSignature?: string;

  protected getCliReportSessionName() {
    return 'midscene-web';
  }

  protected readonly initArgSpec: InitArgSpec<WebAgentInitArgs> = {
    namespace: 'web',
    shape: webAgentInitArgShape,
    cli: {
      preferBareKeys: true,
    },
    adapt: adaptWebAgentInitArgs,
  };

  protected createTemporaryDevice() {
    // Use require to avoid type incompatibility with DeviceAction vs ActionSpaceItem
    // StaticPage.actionSpace() returns DeviceAction[] which is compatible at runtime
    // Use screenshotBase64 field to avoid async ScreenshotItem.create()
    return new StaticPage({
      screenshot: ScreenshotItem.create('', Date.now()),
      shotSize: defaultStaticPageViewportSize,
      shrunkShotToLogicalRatio: 1,
    });
  }

  protected async ensureAgent(
    initArgs?: WebAgentInitArgs,
  ): Promise<AgentOverChromeBridge> {
    const nextSignature = getAgentInitArgsSignature(initArgs);
    const shouldOpenUrl = typeof initArgs?.url === 'string';

    if (
      this.agent &&
      (shouldOpenUrl ||
        shouldRebuildAgentForInitArgs(
          this.lastInitArgsSignature,
          nextSignature,
        ))
    ) {
      try {
        await this.agent?.destroy?.();
      } catch (error) {
        console.debug('Failed to destroy agent during re-init:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) return this.agent;

    // Connect to current tab when no URL provided (handles CLI stateless calls)
    this.agent = await this.initBridgeModeAgent(initArgs);
    this.lastInitArgsSignature = nextSignature;

    return this.agent;
  }

  private async initBridgeModeAgent(
    initArgs?: WebAgentInitArgs,
  ): Promise<AgentOverChromeBridge> {
    const url = initArgs?.url;
    const reportOptions = this.readCliReportAgentOptions();
    const agent = new AgentOverChromeBridge({
      closeConflictServer: true,
      ...(extractAgentBehaviorInitArgs(initArgs) ?? {}),
      ...(reportOptions ?? {}),
    });

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
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args) => {
          const initArgs = this.extractAgentInitParam(args);
          const url = initArgs?.url;

          // Explicit connect always starts a fresh bridge session.
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch {}
            this.agent = undefined;
            this.lastInitArgsSignature = undefined;
          }
          const reportSession = this.createNewCliReportSession(
            url ?? 'current-tab',
          );
          this.commitCliReportSession(reportSession);
          this.agent = await this.ensureAgent(initArgs);

          const screenshot = await this.agent.page?.screenshotBase64();
          const label = url ?? 'current tab';

          return {
            content: [
              { type: 'text', text: `Connected to: ${label}` },
              ...(screenshot ? this.buildScreenshotContent(screenshot) : []),
            ],
          };
        },
      },
      {
        name: 'web_disconnect',
        description:
          'Disconnect from current web page and release browser resources',
        schema: {},
        handler: async () => {
          if (!this.agent) {
            return this.buildTextResult('No active connection to disconnect');
          }

          try {
            await this.agent.destroy?.();
          } catch {}
          this.agent = undefined;
          this.lastInitArgsSignature = undefined;

          return this.buildTextResult('Disconnected from web page');
        },
      },
    ];
  }
}
