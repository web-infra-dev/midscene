import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import { playgroundForAgentFactory } from '@midscene/playground';
import {
  DEFAULT_WDA_PORT,
  PLAYGROUND_SERVER_PORT,
} from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import { IOSAgent } from './agent';
import { IOSDevice } from './device';

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

  // Strip http:// prefix if present
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

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  const { default: open } = await import('open');

  try {
    let wdaConfig = { host: 'localhost', port: DEFAULT_WDA_PORT };
    let connected = false;

    while (!connected) {
      try {
        // Create device with WebDriverAgent configuration
        // deviceId will be auto-detected from WebDriverAgent connection
        const device = new IOSDevice({
          wdaHost: wdaConfig.host,
          wdaPort: wdaConfig.port,
        });

        // Try to connect to WebDriverAgent service
        console.log(
          `🔌 Connecting to WebDriverAgent at ${wdaConfig.host}:${wdaConfig.port}...`,
        );
        await device.connect();

        connected = true;

        // Get real device info after connection
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

        // Ask user what to do next
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
        } else if (action === 'instructions') {
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
        } else if (action === 'configure') {
          wdaConfig = await configureWebDriverAgent();
        }
      }
    }

    // Create agent factory with explicit type
    const agentFactory = async (): Promise<IOSAgent> => {
      const newDevice = new IOSDevice({
        wdaHost: wdaConfig.host,
        wdaPort: wdaConfig.port,
      });
      await newDevice.connect();
      return new IOSAgent(newDevice);
    };

    console.log('🚀 Starting server...');

    // Find available port
    const availablePlaygroundPort = await findAvailablePort(
      PLAYGROUND_SERVER_PORT,
    );

    if (availablePlaygroundPort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePlaygroundPort} instead`,
      );
    }

    const { server: playgroundServer } = await playgroundForAgentFactory(
      agentFactory,
    ).launch({
      port: availablePlaygroundPort,
      openBrowser: false,
      verbose: false,
      staticPath: staticDir,
    });

    console.log('');
    console.log('✨ Midscene iOS Playground is ready!');
    console.log(`🎮 Playground: http://localhost:${playgroundServer.port}`);
    console.log('📱 Device: WebDriverAgent Connected');
    console.log(`🔧 WebDriverAgent: ${wdaConfig.host}:${wdaConfig.port}`);
    console.log(`🔑 Generated Server ID: ${playgroundServer.id}`);
    console.log('');

    open(`http://localhost:${playgroundServer.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

main();
