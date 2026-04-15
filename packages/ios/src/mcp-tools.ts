import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type ToolDefinition,
  createNamespacedInitArgSchema,
  extractNamespacedArgs,
  sanitizeNamespacedArgs,
} from '@midscene/shared/mcp';
import { type IOSAgent, agentFromWebDriverAgent } from './agent';
import { IOSDevice, type IOSDeviceOpt } from './device';

const debug = getDebug('mcp:ios-tools');
const IOS_INIT_ARG_KEYS = [
  'deviceId',
  'wdaHost',
  'wdaPort',
  'useWDA',
  'wdaMjpegPort',
] as const;
const iosInitArgShape = {
  deviceId: z
    .string()
    .optional()
    .describe('iOS device UDID (optional when WDA auto-detect is sufficient)'),
  wdaHost: z
    .string()
    .optional()
    .describe('WebDriverAgent host, defaults to localhost'),
  wdaPort: z.number().optional().describe('WebDriverAgent port'),
  useWDA: z
    .boolean()
    .optional()
    .describe('Whether to reuse an existing WebDriverAgent session'),
  wdaMjpegPort: z
    .number()
    .optional()
    .describe('WebDriverAgent MJPEG streaming port'),
};
type IOSInitArgs = Pick<
  IOSDeviceOpt,
  'deviceId' | 'wdaHost' | 'wdaPort' | 'useWDA' | 'wdaMjpegPort'
>;

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

  protected extractAgentInitParam(args: Record<string, unknown>): unknown {
    return extractNamespacedArgs<
      (typeof IOS_INIT_ARG_KEYS)[number],
      IOSInitArgs
    >(args, 'ios', IOS_INIT_ARG_KEYS);
  }

  protected sanitizeToolArgs(
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    return sanitizeNamespacedArgs(args, 'ios', IOS_INIT_ARG_KEYS);
  }

  protected getAgentInitArgSchema() {
    return createNamespacedInitArgSchema('ios', iosInitArgShape);
  }

  protected async ensureAgent(initParam?: unknown): Promise<IOSAgent> {
    const opts =
      typeof initParam === 'object' && initParam !== null
        ? (initParam as IOSInitArgs)
        : undefined;

    if (this.agent && opts && Object.keys(opts).length > 0) {
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

    debug('Creating iOS agent with WebDriverAgent options:', opts || {});
    this.agent = await agentFromWebDriverAgent({
      autoDismissKeyboard: false,
      ...(opts ?? {}),
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
        schema: this.getAgentInitArgSchema(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args) as
            | IOSInitArgs
            | undefined;
          const agent = await this.ensureAgent(initArgs);
          const screenshot = await agent.page.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to iOS device${initArgs?.deviceId ? `: ${initArgs.deviceId}` : ''}`,
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
    ];
  }
}
