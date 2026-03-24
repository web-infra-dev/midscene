import path from 'node:path';
import {
  agentFromComputer,
  checkAccessibilityPermission,
  getConnectedDisplays,
} from '@midscene/computer';
import {
  type PlaygroundSessionManager,
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
    const staticDir =
      options?.staticDir || path.join(__dirname, '../../static');
    const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);

    if (availablePort !== PLAYGROUND_SERVER_PORT) {
      console.log(
        `⚠️  Port ${PLAYGROUND_SERVER_PORT} is busy, using port ${availablePort} instead`,
      );
    }

    const sessionManager: PlaygroundSessionManager = {
      async getSetupSchema() {
        const displays = await getConnectedDisplays();
        const defaultDisplay =
          displays.find((display) => display.primary) || displays[0];

        return {
          title: 'Connect Computer Agent',
          description: accessibilityCheck.hasPermission
            ? 'Create a Computer Agent for the selected display.'
            : accessibilityCheck.error,
          primaryActionLabel: 'Create Agent',
          fields: [
            {
              key: 'displayId',
              label: 'Display',
              type: 'select',
              required: true,
              options: displays.map((display) => ({
                label: display.name,
                value: String(display.id),
                description: display.primary ? 'Primary display' : undefined,
              })),
              defaultValue: defaultDisplay ? String(defaultDisplay.id) : '',
              placeholder: 'Select a display',
            },
          ],
          targets: displays.map((display) => ({
            id: String(display.id),
            label: display.name,
            description: display.primary ? 'Primary display' : undefined,
            isDefault: display.primary,
          })),
        };
      },
      async listTargets() {
        const displays = await getConnectedDisplays();
        return displays.map((display) => ({
          id: String(display.id),
          label: display.name,
          description: display.primary ? 'Primary display' : undefined,
          isDefault: display.primary,
        }));
      },
      async createSession(input) {
        if (!accessibilityCheck.hasPermission) {
          throw new Error(
            accessibilityCheck.error || 'Accessibility permission is required',
          );
        }

        const displayId =
          input?.displayId === undefined || input.displayId === null
            ? undefined
            : String(input.displayId);
        const agent = await agentFromComputer(
          displayId ? { displayId } : undefined,
        );
        const displays = await getConnectedDisplays();
        const selectedDisplay =
          displays.find((display) => display.id === displayId) ||
          displays.find((display) => display.primary) ||
          displays[0];

        return {
          agent,
          agentFactory: () =>
            agentFromComputer(
              selectedDisplay ? { displayId: selectedDisplay.id } : undefined,
            ),
          preview: createScreenshotPreviewDescriptor({
            title: 'Desktop preview',
          }),
          displayName: selectedDisplay?.name || 'Desktop',
          metadata: {
            displayId: selectedDisplay?.id,
            executionUx: 'countdown-before-run',
          },
        };
      },
    };

    return {
      platformId: 'computer',
      title: 'Midscene Computer Playground',
      sessionManager,
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
        sessionConnected: false,
        setupState: accessibilityCheck.hasPermission ? 'required' : 'blocked',
        setupBlockingReason: accessibilityCheck.error,
      },
    };
  },
});
