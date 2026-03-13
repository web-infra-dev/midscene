import {
  createExportSessionReportTool,
  createSessionAgentOptions,
} from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';
import { type IOSAgent, agentFromWebDriverAgent } from './agent';
import { IOSDevice } from './device';

const debug = getDebug('mcp:ios-tools');

/**
 * iOS-specific tools manager
 * Extends BaseMidsceneTools to provide iOS WebDriverAgent connection tools
 */
export class IOSMidsceneTools extends BaseMidsceneTools<IOSAgent> {
  protected createTemporaryDevice() {
    // Create minimal temporary instance without connecting to WebDriverAgent
    // The constructor only initializes WDA backend, doesn't establish connection
    return new IOSDevice({});
  }

  protected async ensureAgent(
    _unused?: string,
    options?: { sessionId?: string },
  ): Promise<IOSAgent> {
    const sessionId = options?.sessionId;

    if (this.agent && this.shouldResetAgentForSession(sessionId)) {
      try {
        await this.agent.destroy?.();
      } catch (error) {
        debug('Failed to destroy agent during cleanup:', error);
      }
      this.agent = undefined;
    }

    if (this.agent) {
      return this.agent;
    }

    debug('Creating iOS agent with WebDriverAgent');
    const sessionOptions = createSessionAgentOptions({
      sessionId,
      platform: 'ios',
    });
    this.agent = await agentFromWebDriverAgent({
      autoDismissKeyboard: false,
      ...sessionOptions,
    });
    return this.agent;
  }

  /**
   * Provide iOS-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'ios_connect',
        description: 'Connect to iOS device or simulator via WebDriverAgent',
        schema: {},
        handler: async (args: { sessionId?: string }) => {
          const agent = await this.ensureAgent(
            undefined,
            this.getAgentOptions(args as Record<string, unknown>),
          );
          const screenshot = await agent.page.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: 'Connected to iOS device',
              },
              ...this.buildScreenshotContent(screenshot),
            ],
            isError: false,
          };
        },
      },
      {
        name: 'ios_disconnect',
        description:
          'Disconnect from current iOS device and release WebDriverAgent resources',
        schema: {},
        handler: this.createDisconnectHandler('iOS device'),
      },
      createExportSessionReportTool(),
    ];
  }
}
