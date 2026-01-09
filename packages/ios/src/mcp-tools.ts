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

  protected async ensureAgent(): Promise<IOSAgent> {
    if (this.agent) {
      return this.agent;
    }

    debug('Creating iOS agent with WebDriverAgent');
    this.agent = await agentFromWebDriverAgent({
      autoDismissKeyboard: false,
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
        handler: async () => {
          const agent = await this.ensureAgent();
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
        handler: async () => {
          if (!this.agent) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No active connection to disconnect',
                },
              ],
            };
          }

          try {
            await this.agent.destroy?.();
          } catch (error) {
            debug('Failed to destroy agent during disconnect:', error);
          }
          this.agent = undefined;

          return {
            content: [
              {
                type: 'text',
                text: 'Disconnected from iOS device',
              },
            ],
          };
        },
      },
    ];
  }
}
