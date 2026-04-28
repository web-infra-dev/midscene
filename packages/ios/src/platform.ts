import path from 'node:path';
import {
  type PlaygroundSessionManager,
  createMjpegPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import {
  DEFAULT_WDA_PORT,
  PLAYGROUND_SERVER_PORT,
} from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import { type IOSAgent, agentFromWebDriverAgent } from './agent';

export interface IOSPlatformOptions {
  staticDir?: string;
}

export const iosPlaygroundPlatform = definePlaygroundPlatform<
  IOSPlatformOptions | undefined
>({
  id: 'ios',
  title: 'Midscene iOS Playground',
  description: 'iOS playground platform descriptor',
  async prepare(options) {
    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const availablePlaygroundPort = await findAvailablePort(
      PLAYGROUND_SERVER_PORT,
    );

    if (availablePlaygroundPort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePlaygroundPort} instead`,
      );
    }

    const sessionManager: PlaygroundSessionManager = {
      async getSetupSchema() {
        return {
          title: 'Connect WebDriverAgent',
          description:
            'Provide the WebDriverAgent host and port that are already running for your selected iPhone or simulator.',
          primaryActionLabel: 'Create Agent',
          fields: [
            {
              key: 'host',
              label: 'WebDriverAgent host',
              type: 'text',
              required: true,
              defaultValue: 'localhost',
              placeholder: 'localhost',
            },
            {
              key: 'port',
              label: 'WebDriverAgent port',
              type: 'number',
              required: true,
              defaultValue: DEFAULT_WDA_PORT,
              placeholder: DEFAULT_WDA_PORT.toString(),
            },
          ],
        };
      },
      async createSession(input) {
        const host =
          typeof input?.host === 'string' && input.host.trim()
            ? input.host.trim().replace(/^https?:\/\//, '')
            : 'localhost';
        const port =
          typeof input?.port === 'number'
            ? input.port
            : Number.parseInt(String(input?.port ?? DEFAULT_WDA_PORT), 10);

        if (Number.isNaN(port) || port < 1 || port > 65535) {
          throw new Error(
            `Invalid WebDriverAgent port: ${String(input?.port)}`,
          );
        }

        const connectAgent = async (): Promise<IOSAgent> => {
          return agentFromWebDriverAgent({
            wdaHost: host,
            wdaPort: port,
          });
        };

        const agent = await connectAgent();
        const deviceInfo = await agent.interface.getConnectedDeviceInfo?.();
        const displayName = deviceInfo
          ? `${deviceInfo.name} (${deviceInfo.model})`
          : `${host}:${port}`;

        return {
          agent,
          agentFactory: connectAgent,
          preview: createMjpegPreviewDescriptor({
            title: 'iOS device preview',
          }),
          displayName,
          metadata: {
            wdaHost: host,
            wdaPort: port,
            ...(deviceInfo ? { deviceInfo } : {}),
          },
        };
      },
    };

    return {
      platformId: 'ios',
      title: 'Midscene iOS Playground',
      sessionManager,
      launchOptions: {
        port: availablePlaygroundPort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
      },
      preview: createMjpegPreviewDescriptor({
        title: 'iOS device preview',
      }),
      metadata: {
        sessionConnected: false,
        setupState: 'required',
      },
    };
  },
});
