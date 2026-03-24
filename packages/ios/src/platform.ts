import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import {
  createMjpegPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import {
  DEFAULT_WDA_PORT,
  PLAYGROUND_SERVER_PORT,
} from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import { IOSAgent } from './agent';
import { IOSDevice } from './device';

export interface IOSPlatformOptions {
  staticDir?: string;
  host?: string;
  port?: number;
}

// Function to configure WebDriverAgent connection
async function configureWebDriverAgent(): Promise<{
  host: string;
  port: number;
}> {
  console.log('🔧 WebDriverAgent Configuration');
  console.log(`Default: localhost:${DEFAULT_WDA_PORT}`);

  const useDefault = await select({
    message: `Use default WebDriverAgent address (localhost:${DEFAULT_WDA_PORT})?`,
    choices: [
      { name: `Yes, use localhost:${DEFAULT_WDA_PORT}`, value: true },
      { name: 'No, specify custom address', value: false },
    ],
  });

  if (useDefault) {
    return { host: 'localhost', port: DEFAULT_WDA_PORT };
  }

  const hostInput = await input({
    message: 'WebDriverAgent host:',
    default: 'localhost',
  });

  const host = hostInput.replace(/^https?:\/\//, '');

  const portInput = await input({
    message: 'WebDriverAgent port:',
    default: DEFAULT_WDA_PORT.toString(),
  });

  const port = Number.parseInt(portInput, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error(`❌ Invalid port number. Using default ${DEFAULT_WDA_PORT}.`);
    return { host, port: DEFAULT_WDA_PORT };
  }

  return { host, port };
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
    let wdaConfig = {
      host: options?.host || 'localhost',
      port: options?.port || DEFAULT_WDA_PORT,
    };
    let connected = false;

    while (!connected) {
      try {
        const device = new IOSDevice({
          wdaHost: wdaConfig.host,
          wdaPort: wdaConfig.port,
        });

        console.log(
          `🔌 Connecting to WebDriverAgent at ${wdaConfig.host}:${wdaConfig.port}...`,
        );
        await device.connect();

        connected = true;

        const deviceInfo = await device.getConnectedDeviceInfo();
        console.log('✅ Connected to WebDriverAgent successfully!');
        if (deviceInfo) {
          console.log(
            `📱 Connected to: ${deviceInfo.name} (${deviceInfo.model})`,
          );
          console.log(`🔑 Device UDID: ${deviceInfo.udid}`);
        }
      } catch (error) {
        console.error(
          `❌ Failed to connect to WebDriverAgent: ${error instanceof Error ? error.message : String(error)}`,
        );

        const action = await select({
          message: 'What would you like to do?',
          choices: [
            {
              name: '🔧 Configure different WebDriverAgent address',
              value: 'configure',
            },
            { name: '📖 Show setup instructions', value: 'instructions' },
            { name: '🚪 Exit', value: 'exit' },
          ],
        });

        if (action === 'exit') {
          console.log('👋 Goodbye!');
          process.exit(0);
        }

        if (action === 'instructions') {
          console.log(`
🔧 WebDriverAgent Setup Instructions:

1. Install WebDriverAgent:
   npm install appium-webdriveragent

2. Open WebDriverAgent project in Xcode:
   node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj

3. Select your target device/simulator in Xcode

4. Build and run the WebDriverAgentRunner scheme

5. WebDriverAgent will bind to your selected device and listen on port ${DEFAULT_WDA_PORT}

6. Restart this playground to connect

💡 The WebDriverAgent service is already bound to the device you selected in Xcode.
💡 For more details, visit: https://github.com/appium/WebDriverAgent
`);
          continue;
        }

        wdaConfig = await configureWebDriverAgent();
      }
    }

    const availablePlaygroundPort = await findAvailablePort(
      PLAYGROUND_SERVER_PORT,
    );

    if (availablePlaygroundPort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePlaygroundPort} instead`,
      );
    }

    return {
      platformId: 'ios',
      title: 'Midscene iOS Playground',
      agentFactory: async (): Promise<IOSAgent> => {
        const newDevice = new IOSDevice({
          wdaHost: wdaConfig.host,
          wdaPort: wdaConfig.port,
        });
        await newDevice.connect();
        return new IOSAgent(newDevice);
      },
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
        wdaHost: wdaConfig.host,
        wdaPort: wdaConfig.port,
      },
    };
  },
});
