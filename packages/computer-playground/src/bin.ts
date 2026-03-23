import os from 'node:os';
import path from 'node:path';
import { ComputerDevice } from '@midscene/computer';
import { launchPreparedPlaygroundPlatform } from '@midscene/playground';
import puppeteer from 'puppeteer';
import { BrowserWindowController } from './browser-window-controller';
import { computerPlaygroundPlatform } from './platform';

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

    let windowController: BrowserWindowController | null = null;

    console.log('🚀 Starting server...');
    const prepared = await computerPlaygroundPlatform.prepare({
      staticDir,
      getWindowController: () => windowController,
    });
    const { server: playgroundServer } =
      await launchPreparedPlaygroundPlatform(prepared);

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

    console.log(`🪟 Window ID: ${windowInfo.windowId}`);

    windowController = new BrowserWindowController(
      session,
      page,
      windowInfo.windowId,
    );
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
