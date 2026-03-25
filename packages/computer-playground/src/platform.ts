import path from 'node:path';
import {
  agentFromComputer,
  checkAccessibilityPermission,
} from '@midscene/computer';
import {
  createScreenshotPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import { findAvailablePort } from '@midscene/shared/node';
import type { BrowserWindowController } from './browser-window-controller';

export interface ComputerPlatformOptions {
  staticDir?: string;
  getWindowController?: () => BrowserWindowController | null;
}

export const computerPlaygroundPlatform = definePlaygroundPlatform<
  ComputerPlatformOptions | undefined
>({
  id: 'computer',
  title: 'Midscene Computer Playground',
  description: 'Computer playground platform descriptor',
  async prepare(options) {
    const accessibilityCheck = checkAccessibilityPermission(true);
    if (!accessibilityCheck.hasPermission) {
      console.error('❌ Permission Error:\n');
      console.error(accessibilityCheck.error);
      process.exit(1);
    }

    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    return {
      platformId: 'computer',
      title: 'Midscene Computer Playground',
      agentFactory: agentFromComputer,
      launchOptions: {
        port: availablePort,
        openBrowser: false,
        verbose: false,
        staticPath: staticDir,
        configureServer(server) {
          server.app.use('/execute', async (_req, res, next) => {
            const windowController = options?.getWindowController?.();
            if (!windowController) {
              console.warn(
                '⚠️  Window controller not initialized yet, skipping window control',
              );
              next();
              return;
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));
            await windowController.minimize();

            const originalSend = res.send.bind(res);
            res.send = (body: any) => {
              windowController.restore();
              return originalSend(body);
            };

            next();
          });
        },
      },
      preview: createScreenshotPreviewDescriptor({
        title: 'Desktop preview',
      }),
      metadata: {
        executionUx: 'countdown-before-run',
      },
    };
  },
});
