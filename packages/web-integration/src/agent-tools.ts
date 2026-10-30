import { ScreenshotItem } from '@midscene/core';
import {
  extractAgentBehaviorInitArgs,
  getAgentInitArgsSignature,
  shouldRebuildAgentForInitArgs,
} from '@midscene/shared/agent-tools/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/agent-tools/base-tools';
import type { ToolDefinition } from '@midscene/shared/agent-tools/types';
import {
  type WebAgentInitArgs,
  adaptWebAgentInitArgs,
  webAgentInitArgShape,
} from './agent-init-args';
import { createTabTools } from './agent-tools-tabs';
import { AgentOverChromeBridge } from './bridge-mode';
import { defaultStaticPageViewportSize } from './common/viewport';
import { StaticPage } from './static';

/**
 * Tools manager for Web bridge mode.
 */
export class WebMidsceneTools extends BaseMidsceneTools<
  AgentOverChromeBridge,
  WebAgentInitArgs
> {
  private lastInitArgsSignature?: string;
  private lastInitArgs?: WebAgentInitArgs;

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
    this.lastInitArgs = initArgs;

    return this.agent;
  }

  private async initBridgeModeAgent(
    initArgs?: WebAgentInitArgs,
    tabId?: number,
  ): Promise<AgentOverChromeBridge> {
    const url = initArgs?.url;
    const reportOptions = this.readCliReportAgentOptions();
    const agent = new AgentOverChromeBridge({
      closeConflictServer: true,
      ...(extractAgentBehaviorInitArgs(initArgs) ?? {}),
      ...(reportOptions ?? {}),
    });

    try {
      if (!url) {
        await agent.connectCurrentTab({ tabId, forceSameTabNavigation: false });
      } else {
        await agent.connectNewTabWithUrl(url, {
          forceSameTabNavigation: false,
        });
      }
      if (
        tabId !== undefined &&
        (await agent.page.getActiveTabId()) !== tabId
      ) {
        throw new Error(
          'The browser extension did not switch tabs. Update the Midscene extension and retry.',
        );
      }
      return agent;
    } catch (error) {
      try {
        await agent.destroy();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to connect and clean up the Bridge agent.',
        );
      }
      throw error;
    }
  }

  protected preparePlatformTools(): ToolDefinition[] {
    return [
      ...createTabTools({
        list: async () => {
          const agent = await this.ensureAgent();
          const activeId = String(await agent.page.getActiveTabId());
          return (await agent.getBrowserTabList()).map((tab) => ({
            id: tab.id,
            title: tab.title,
            url: tab.url,
            active: tab.id === activeId,
          }));
        },
        select: async (id) => {
          if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
            throw new Error(`Invalid Bridge tab ID: ${id}`);
          }
          const agent = await this.ensureAgent();
          if (!(await agent.getBrowserTabList()).some((tab) => tab.id === id)) {
            throw new Error(
              `Tab ${id} does not exist or has closed. Run tabs again.`,
            );
          }
          await agent.destroy();
          this.agent = undefined;
          this.lastInitArgsSignature = undefined;
          this.agent = await this.initBridgeModeAgent(
            { ...this.lastInitArgs, url: undefined },
            Number(id),
          );
        },
      }),
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
