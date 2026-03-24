import os from 'node:os';
import path from 'node:path';
import { ScrcpyServer } from '@midscene/android-playground';
import { ComputerDevice } from '@midscene/computer';
import { BrowserWindowController } from '@midscene/computer-playground';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import puppeteer from 'puppeteer';
import { createAllInOnePlaygroundLauncher } from './platform';

const staticDir = path.join(__dirname, '../../static');

async function main() {
  try {
    let windowController: BrowserWindowController | null = null;
    const scrcpyServer = new ScrcpyServer();
    const scrcpyPort = await findAvailablePort(SCRCPY_SERVER_PORT);
    const launcher = createAllInOnePlaygroundLauncher({
      staticDir,
      android: {
        scrcpyServer,
        scrcpyPort,
      },
      computer: {
        getWindowController: () => windowController,
      },
    });

    const { server: playgroundServer } = await launcher.launch();

    console.log('');
    console.log('✨ Midscene All-in-One Playground is ready!');
    console.log(`🎮 Playground: http://localhost:${playgroundServer.port}`);
    console.log(`🔑 Server ID: ${playgroundServer.id}`);
    console.log('');

    const url = `http://localhost:${playgroundServer.port}`;
    const device = new ComputerDevice();
    await device.connect();
    const screenSize = await device.size();
    await device.destroy();

    const windowWidth = 520;
    const windowHeight = Math.min(screenSize.height, 1200);
    const userDataDir = path.join(
      os.homedir(),
      '.midscene',
      'all-in-one-playground',
    );

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

    try {
      browser = await puppeteer.launch({
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

      const pages = await browser.pages();
      const page = pages[0];
      const session = await page.createCDPSession();
      const windowInfo = await session.send('Browser.getWindowForTarget');

      windowController = new BrowserWindowController(
        session,
        page,
        windowInfo.windowId,
      );
    } catch (error) {
      console.warn(
        'Failed to open the all-in-one playground window automatically. The server is still running:',
        error,
      );
    }

    const shutdown = async () => {
      await browser?.close().catch(() => undefined);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start all-in-one playground:', error);
    process.exit(1);
  }
}

main();
