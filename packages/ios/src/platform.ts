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
import { normalizeWebDriverBaseUrl } from '@midscene/webdriver';
import {
  type IOSAgent,
  type IOSAgentOpt,
  agentFromWebDriverAgent,
} from './agent';
import {
  assertWdaConnectionOptions,
  normalizeMjpegStreamUrl,
} from './wda-options';

export interface IOSPlatformOptions {
  staticDir?: string;
  getAgentOptions?: () => IOSAgentOpt;
}

// Quick liveness probe so getSetupSchema can flip on autoSubmitWhenReady
// when a WDA is already listening on the defaults — mirrors the Android
// playground UX where a single connected device auto-creates the agent
// instead of forcing the user through the form.
async function probeWdaReady(
  host: string,
  port: number,
  timeoutMs = 800,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/status`, {
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as {
      value?: { ready?: boolean };
    } | null;
    return body?.value?.ready === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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
        const wdaReady = await probeWdaReady('localhost', DEFAULT_WDA_PORT);
        return {
          title: 'Connect WebDriverAgent',
          description:
            'Provide a WebDriverAgent base URL, or the host and port for your selected iPhone or simulator.',
          primaryActionLabel: 'Create Agent',
          autoSubmitWhenReady: wdaReady,
          fields: [
            {
              key: 'host',
              label: 'WebDriverAgent host',
              type: 'text',
              required: false,
              placeholder: 'localhost',
            },
            {
              key: 'port',
              label: 'WebDriverAgent port',
              type: 'number',
              required: false,
              placeholder: DEFAULT_WDA_PORT.toString(),
            },
            {
              key: 'baseUrl',
              label: 'WebDriverAgent base URL (optional)',
              type: 'text',
              required: false,
              placeholder: 'https://gateway.example/device/wda',
            },
            {
              key: 'mjpegUrl',
              label: 'MJPEG stream URL (optional)',
              type: 'text',
              required: false,
              placeholder: 'https://gateway.example/device/mjpeg',
            },
            {
              key: 'mjpegPort',
              label: 'MJPEG stream port (optional)',
              type: 'number',
              required: false,
              placeholder: '9100',
            },
            {
              key: 'sessionId',
              label: 'WebDriverAgent session ID',
              type: 'text',
              required: false,
              placeholder: 'Existing session ID',
            },
          ],
        };
      },
      async createSession(input) {
        const baseUrl =
          typeof input?.baseUrl === 'string' && input.baseUrl.trim()
            ? normalizeWebDriverBaseUrl(input.baseUrl.trim())
            : undefined;
        const hasHostInput =
          input?.host !== undefined && String(input.host).trim() !== '';
        const hasPortInput =
          input?.port !== undefined && String(input.port).trim() !== '';
        const mjpegUrl =
          typeof input?.mjpegUrl === 'string' && input.mjpegUrl.trim()
            ? normalizeMjpegStreamUrl(input.mjpegUrl.trim())
            : undefined;
        const hasMjpegPortInput =
          input?.mjpegPort != null && String(input.mjpegPort).trim() !== '';
        const mjpegPort = hasMjpegPortInput
          ? Number(input?.mjpegPort)
          : undefined;
        assertWdaConnectionOptions({
          ...(baseUrl ? { wdaBaseUrl: baseUrl } : {}),
          ...(hasHostInput ? { wdaHost: String(input?.host) } : {}),
          ...(hasPortInput ? { wdaPort: Number(input?.port) } : {}),
          ...(mjpegUrl ? { wdaMjpegUrl: mjpegUrl } : {}),
          ...(mjpegPort !== undefined ? { wdaMjpegPort: mjpegPort } : {}),
        });
        if (
          mjpegPort !== undefined &&
          (!Number.isInteger(mjpegPort) || mjpegPort < 1 || mjpegPort > 65535)
        ) {
          throw new Error(
            `Invalid MJPEG stream port: ${String(input?.mjpegPort)}`,
          );
        }
        const host =
          typeof input?.host === 'string' && input.host.trim()
            ? input.host.trim().replace(/^https?:\/\//, '')
            : 'localhost';
        const port = !hasPortInput
          ? DEFAULT_WDA_PORT
          : typeof input?.port === 'number'
            ? input.port
            : Number.parseInt(String(input?.port), 10);

        if (Number.isNaN(port) || port < 1 || port > 65535) {
          throw new Error(
            `Invalid WebDriverAgent port: ${String(input?.port)}`,
          );
        }
        const sessionId =
          typeof input?.sessionId === 'string' && input.sessionId.trim()
            ? input.sessionId.trim()
            : undefined;

        const connectAgent = async (): Promise<IOSAgent> => {
          const agentOptions = {
            ...options?.getAgentOptions?.(),
            ...(baseUrl
              ? { wdaBaseUrl: baseUrl }
              : { wdaHost: host, wdaPort: port }),
            ...(mjpegUrl ? { wdaMjpegUrl: mjpegUrl } : {}),
            ...(mjpegPort !== undefined ? { wdaMjpegPort: mjpegPort } : {}),
            ...(sessionId ? { sessionId } : {}),
          };
          assertWdaConnectionOptions(agentOptions);
          return agentFromWebDriverAgent(agentOptions);
        };

        const agent = await connectAgent();
        const deviceInfo = await agent.interface.getConnectedDeviceInfo?.();
        const gatewayUrl = baseUrl ? new URL(baseUrl) : undefined;
        const displayName = deviceInfo
          ? `${deviceInfo.name} (${deviceInfo.model})`
          : gatewayUrl
            ? `${gatewayUrl.host} (WDA gateway)`
            : `${host}:${port}`;

        return {
          agent,
          agentFactory: connectAgent,
          preview: createMjpegPreviewDescriptor({
            title: 'iOS device preview',
          }),
          displayName,
          metadata: {
            wdaHost: gatewayUrl?.hostname ?? host,
            wdaPort: gatewayUrl
              ? Number(
                  gatewayUrl.port ||
                    (gatewayUrl.protocol === 'https:' ? 443 : 80),
                )
              : port,
            ...(sessionId ? { sessionId } : {}),
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
