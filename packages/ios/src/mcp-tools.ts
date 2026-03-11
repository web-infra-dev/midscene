import {
  createSessionAgentOptions,
  exportSessionReport,
  z,
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

  protected async ensureAgent(): Promise<IOSAgent> {
    if (this.agent) {
      return this.agent;
    }

    debug('Creating iOS agent with WebDriverAgent');
    const sessionOptions = createSessionAgentOptions({
      sessionId: this.getInvocationStringArg('sessionId'),
      platform: 'ios',
      commandId: this.getInvocationCommandId(),
      commandName: this.getInvocationCommandName(),
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
        handler: async (args: { sessionId?: string }) =>
          this.runWithInvocationContext(
            { ...args, __commandName: 'ios_connect' },
            async () => {
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
          ),
      },
      {
        name: 'ios_disconnect',
        description:
          'Disconnect from current iOS device and release WebDriverAgent resources',
        schema: {},
        handler: this.createDisconnectHandler('iOS device'),
      },
      {
        name: 'ios_export_session_report',
        description:
          'Generate a merged HTML report from a persisted iOS session',
        schema: {
          sessionId: z.string().describe('Persistent session ID to export'),
        },
        handler: async (args: Record<string, unknown>) => {
          const sessionId = args.sessionId;
          if (typeof sessionId !== 'string' || !sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'sessionId is required to export a session report',
                },
              ],
              isError: true,
            };
          }
          const reportPath = exportSessionReport(sessionId);
          return this.buildTextResult(
            `Session report generated: ${reportPath}`,
          );
        },
      },
    ];
  }
}
