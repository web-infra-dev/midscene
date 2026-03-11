import os from 'node:os';
import path from 'node:path';
import {
  ComputerDevice,
  agentFromComputer,
  checkAccessibilityPermission,
} from '@midscene/computer';
import { playgroundForAgentFactory } from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import puppeteer from 'puppeteer';

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  try {
    // Check accessibility permission first (macOS only)
    // Pass true to trigger system prompt and open settings if permission is not granted
    const accessibilityCheck = checkAccessibilityPermission(true);
    if (!accessibilityCheck.hasPermission) {
      console.error('❌ Permission Error:\n');
      console.error(accessibilityCheck.error);
      process.exit(1);
    }

    // List available displays
    const displays = await ComputerDevice.listDisplays();
    if (displays.length > 0) {
      console.log('🖥️  Available displays:');
      for (const display of displays) {
        console.log(
          `  ${display.primary ? '✅' : '  '} ${display.name} (${display.id})${display.primary ? ' [Primary]' : ''}`,
        );
      }
    }

    // Store window control handles (will be initialized after browser launch)
    let windowController: {
      session: any;
      page: any;
      windowId: number;
    } | null = null;

    console.log('🚀 Starting server...');

    // Find available port
    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    const { server: playgroundServer } = await playgroundForAgentFactory(
      agentFromComputer,
    ).launch({
      port: availablePort,
      openBrowser: false,
      verbose: false,
      staticPath: staticDir,
      configureServer(server) {
        server.app.use('/execute', async (_req, res, next) => {
          if (!windowController) {
            console.warn(
              '⚠️  Window controller not initialized yet, skipping window control',
            );
            next();
            return;
          }

          const { session, page, windowId } = windowController;

          await new Promise((resolve) => setTimeout(resolve, 1500));

          try {
            await session.send('Browser.setWindowBounds', {
              windowId,
              bounds: { windowState: 'minimized' },
            });
            console.log('🔽 Window minimized, starting task execution...');
          } catch (error) {
            console.warn('⚠️  Failed to minimize window:', error);
          }

          const originalSend = res.send.bind(res);
          res.send = (body: any) => {
            Promise.all([
              session.send('Browser.setWindowBounds', {
                windowId,
                bounds: { windowState: 'normal' },
              }),
              page.bringToFront(),
            ])
              .then(() => {
                console.log('🔼 Window restored');
              })
              .catch((error) => {
                console.warn('⚠️  Failed to restore window:', error);
              });

            return originalSend(body);
          };

          next();
        });
      },
    });

    console.log('');
    console.log('✨ Midscene Computer Playground is ready!');
    console.log(`🎮 Playground: http://localhost:${playgroundServer.port}`);
    console.log(`🔑 Server ID: ${playgroundServer.id}`);
    console.log('');

    // Open browser in app mode using Puppeteer
    const url = `http://localhost:${playgroundServer.port}`;

    console.log('🌐 Launching browser in standalone window mode...');

    // Get screen size and calculate window dimensions
    const device = new ComputerDevice();
    await device.connect();
    const screenSize = await device.size();
    await device.destroy();

    const windowWidth = 500;
    const maxWindowHeight = 1200;
    const windowHeight = Math.min(screenSize.height, maxWindowHeight);

    console.log(
      `📐 Screen size: ${screenSize.width}x${screenSize.height}, window size: ${windowWidth}x${windowHeight}`,
    );

    // Use persistent user data directory to preserve localStorage
    const userDataDir = path.join(
      os.homedir(),
      '.midscene',
      'computer-playground',
    );
    console.log(`💾 User data directory: ${userDataDir}`);

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir,
      args: [
        `--app=${url}`,
        `--window-size=${windowWidth},${windowHeight}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    console.log('✅ Browser launched successfully');

    // Get page and create CDP session for window control
    const pages = await browser.pages();
    const page = pages[0];
    const session = await page.createCDPSession();
    const windowInfo = await session.send('Browser.getWindowForTarget');
    const windowId = windowInfo.windowId;

    console.log(`🪟 Window ID: ${windowId}`);

    // Initialize window controller
    windowController = { session, page, windowId };
    console.log('✅ Window controller initialized');

    // Handle cleanup on process exit
    process.on('SIGINT', async () => {
      console.log('\n👋 Shutting down...');
      await browser.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

main();
