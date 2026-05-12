import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { type IOSAgent, agentFromWebDriverAgent } from './agent';
import { IOSDevice, type IOSDeviceOpt } from './device';

const debug = getDebug('mcp:ios-tools');

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
export class IOSMidsceneTools extends BaseMidsceneTools<IOSAgent, IOSInitArgs> {
  protected getCliReportSessionName() {
    return 'midscene-ios';
  }

  protected readonly initArgSpec: InitArgSpec<IOSInitArgs> = {
    namespace: 'ios',
    shape: iosInitArgShape,
    cli: {
      preferBareKeys: true,
    },
    adapt: (extracted) => extracted as IOSInitArgs | undefined,
  };

  private lastOptsSignature?: string;

  protected createTemporaryDevice() {
    // Create minimal temporary instance without connecting to WebDriverAgent
    // The constructor only initializes WDA backend, doesn't establish connection
    return new IOSDevice({});
  }

  protected async ensureAgent(opts?: IOSInitArgs): Promise<IOSAgent> {
    const hasOpts = !!opts && Object.keys(opts).length > 0;
    const nextSignature = hasOpts ? JSON.stringify(opts) : undefined;

    if (this.agent && hasOpts && nextSignature !== this.lastOptsSignature) {
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
    const reportOptions = this.readCliReportAgentOptions();
    this.agent = await agentFromWebDriverAgent({
      autoDismissKeyboard: false,
      ...(reportOptions ?? {}),
      ...(opts ?? {}),
    });
    this.lastOptsSignature = nextSignature;
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
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const identity =
            initArgs?.deviceId ??
            (initArgs?.wdaHost || initArgs?.wdaPort
              ? `wda-${initArgs.wdaHost ?? 'localhost'}-${initArgs.wdaPort ?? 'default'}`
              : 'auto');
          const reportSession = this.createNewCliReportSession(identity);
          this.commitCliReportSession(reportSession);
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (error) {
              debug('Failed to destroy agent during connect:', error);
            }
            this.agent = undefined;
          }
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
