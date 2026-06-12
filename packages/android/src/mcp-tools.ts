import { z } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import {
  type AgentBehaviorInitArgs,
  agentBehaviorInitArgShape,
  extractAgentBehaviorInitArgs,
  getAgentInitArgsSignature,
} from '@midscene/shared/mcp/agent-behavior-init-args';
import {
  BaseMidsceneTools,
  type InitArgSpec,
} from '@midscene/shared/mcp/base-tools';
import type { ToolDefinition } from '@midscene/shared/mcp/types';
import { type AndroidAgent, agentFromAdbDevice } from './agent';
import { AndroidDevice } from './device';

const debug = getDebug('mcp:android-tools');

type AndroidInitArgs = AgentBehaviorInitArgs & {
  deviceId?: string;
  useScrcpy?: boolean;
};

function adaptAndroidInitArgs(
  extracted: Record<string, unknown> | undefined,
): AndroidInitArgs | undefined {
  if (!extracted) {
    return undefined;
  }

  const initArgs: AndroidInitArgs = {
    ...(typeof extracted.deviceId === 'string'
      ? { deviceId: extracted.deviceId }
      : {}),
    ...(typeof extracted.useScrcpy === 'boolean'
      ? { useScrcpy: extracted.useScrcpy }
      : {}),
    ...(extractAgentBehaviorInitArgs(extracted as AgentBehaviorInitArgs) ?? {}),
  };

  return Object.keys(initArgs).length > 0 ? initArgs : undefined;
}

/**
 * Android-specific tools manager
 * Extends BaseMidsceneTools to provide Android ADB device connection tools
 */
export class AndroidMidsceneTools extends BaseMidsceneTools<
  AndroidAgent,
  AndroidInitArgs
> {
  private lastInitArgsSignature?: string;

  protected getCliReportSessionName() {
    return 'midscene-android';
  }

  protected readonly initArgSpec: InitArgSpec<AndroidInitArgs> = {
    namespace: 'android',
    shape: {
      deviceId: z
        .string()
        .optional()
        .describe('Android device ID (from adb devices)'),
      useScrcpy: z
        .boolean()
        .optional()
        .describe('Enable scrcpy accelerated screenshots'),
      ...agentBehaviorInitArgShape,
    },
    cli: {
      preferBareKeys: true,
    },
    adapt: adaptAndroidInitArgs,
  };

  protected createTemporaryDevice() {
    // Create minimal temporary instance without connecting to device
    // The constructor doesn't establish ADB connection
    return new AndroidDevice('temp-for-action-space', {});
  }

  protected async ensureAgent(
    initArgs?: AndroidInitArgs,
  ): Promise<AndroidAgent> {
    const deviceId = initArgs?.deviceId;
    const nextSignature = getAgentInitArgsSignature(initArgs);

    if (
      this.agent &&
      nextSignature &&
      nextSignature !== this.lastInitArgsSignature
    ) {
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

    debug('Creating Android agent with deviceId:', deviceId || 'auto-detect');
    const reportOptions = this.readCliReportAgentOptions();
    const agent = await agentFromAdbDevice(deviceId, {
      autoDismissKeyboard: false,
      ...(extractAgentBehaviorInitArgs(initArgs) ?? {}),
      ...(initArgs?.useScrcpy ? { scrcpyConfig: { enabled: true } } : {}),
      ...(reportOptions ?? {}),
    });
    this.agent = agent;
    this.lastInitArgsSignature = nextSignature;
    return agent;
  }

  /**
   * Provide Android-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'android_connect',
        description:
          'Connect to Android device via ADB. If deviceId not provided, uses the first available device.',
        schema: this.getAgentInitArgSchema(),
        cli: this.getAgentInitArgCliMetadata(),
        handler: async (args: Record<string, unknown>) => {
          const initArgs = this.extractAgentInitParam(args);
          const deviceId = initArgs?.deviceId;
          const reportSession = this.createNewCliReportSession(
            deviceId ?? 'auto',
          );
          this.commitCliReportSession(reportSession);
          if (this.agent) {
            try {
              await this.agent.destroy?.();
            } catch (error) {
              debug('Failed to destroy agent during connect:', error);
            }
            this.agent = undefined;
            this.lastInitArgsSignature = undefined;
          }
          const agent = await this.ensureAgent(initArgs);
          const screenshot = await agent.page.screenshotBase64();

          return {
            content: [
              {
                type: 'text',
                text: `Connected to Android device${deviceId ? `: ${deviceId}` : ' (auto-detected)'}`,
              },
              ...this.buildScreenshotContent(screenshot),
            ],
            isError: false,
          };
        },
      },
      {
        name: 'android_disconnect',
        description:
          'Disconnect from current Android device and release ADB resources',
        schema: {},
        handler: this.createDisconnectHandler('Android device'),
      },
    ];
  }
}
