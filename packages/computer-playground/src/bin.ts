import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ComputerDevice, agentFromComputer } from '@midscene/computer';
import { PlaygroundServer } from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import puppeteer from 'puppeteer';

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.on('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  let attempts = 0;
  const maxAttempts = 15;

  while (!(await isPortAvailable(port))) {
    attempts++;
    if (attempts >= maxAttempts) {
      console.error(
        `❌ Unable to find available port after ${maxAttempts} attempts starting from ${startPort}`,
      );
      process.exit(1);
    }
    port++;
  }
  return port;
}

const staticDir = path.join(__dirname, '../../static');

const main = async () => {
  try {
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

    // Create PlaygroundServer with agent factory
    const playgroundServer = new PlaygroundServer(async () => {
      return await agentFromComputer();
    }, staticDir);

    // Store window control handles (will be initialized after browser launch)
    let windowController: {
      session: any;
      page: any;
      windowId: number;
    } | null = null;

    // Add middleware to handle window minimization during task execution using CDP
    // IMPORTANT: Must be added BEFORE playgroundServer.launch()
    playgroundServer.app.use('/execute', async (_req, res, next) => {
      // Check if window controller is initialized
      if (!windowController) {
        console.warn(
          '⚠️  Window controller not initialized yet, skipping window control',
        );
        next();
        return;
      }

      const { session, page, windowId } = windowController;

      // Delay 1.5 seconds then minimize window BEFORE task execution starts
      // This gives user time to see the notification in UI
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

      // Store original res.send to wrap it
      const originalSend = res.send.bind(res);
      res.send = (body: any) => {
        // Restore window after task completes (non-blocking)
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

    console.log('🚀 Starting server...');

    // Find available port
    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    await playgroundServer.launch(availablePort);

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
