import path from 'node:path';
import {
  ComputerNativeEventRecorder,
  agentFromComputer,
  checkAccessibilityPermission,
  checkScreenRecordingPermission,
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
    // Probe permissions once at prepare time only to decide whether to
    // open the system prompt. The authoritative check happens inside
    // each request so users granting permission later don't get blocked
    // by a stale snapshot (the playground core caches the `prepare`
    // result for the lifetime of the service).
    const initialAccessibility = checkAccessibilityPermission(true);
    const initialScreenRecording = checkScreenRecordingPermission(true);
    const evaluatePermissions = () => {
      const accessibilityCheck = checkAccessibilityPermission(false);
      const screenRecordingCheck = checkScreenRecordingPermission(false);
      const permissionError =
        (!accessibilityCheck.hasPermission && accessibilityCheck.error) ||
        (!screenRecordingCheck.hasPermission && screenRecordingCheck.error) ||
        undefined;
      return {
        accessibilityCheck,
        screenRecordingCheck,
        permissionError,
        allPermissionsGranted:
          accessibilityCheck.hasPermission &&
          screenRecordingCheck.hasPermission,
      };
    };
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
        const { allPermissionsGranted, permissionError } =
          evaluatePermissions();
        const displays = await getConnectedDisplays();
        const defaultDisplay =
          displays.find((display) => display.primary) || displays[0];

        return {
          title: 'Connect Computer Agent',
          description: allPermissionsGranted
            ? 'Create a Computer Agent for the selected display.'
            : permissionError,
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
        const { allPermissionsGranted, permissionError } =
          evaluatePermissions();
        if (!allPermissionsGranted) {
          throw new Error(
            permissionError ||
              'Accessibility and Screen Recording permissions are required',
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
        const recorder = new ComputerNativeEventRecorder({
          displayId: selectedDisplay?.id,
          displayName: selectedDisplay?.name,
          screenshot: () => agent.interface.screenshotBase64(),
        });

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
          recorderSource: {
            async getCapabilities() {
              const result = recorder.getCapabilities();
              return {
                supported: result.supported,
                source: result.source,
                platformId: result.platformId,
                error: result.error,
              };
            },
            async start(_sessionId: string) {
              return recorder.start();
            },
            async stop() {
              await recorder.stop();
            },
            async getEvents(since) {
              return recorder.getEvents(since);
            },
            onPreviewInteract({ payload }) {
              recorder.suppressPreviewInteract(payload);
            },
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
      },
      executionHooks: {
        async beforeExecute() {
          const windowController = options?.getWindowController?.();
          if (!windowController) {
            console.warn(
              '⚠️  Window controller not initialized yet, skipping window control',
            );
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
          await windowController.minimize();
        },
        async afterExecute() {
          const windowController = options?.getWindowController?.();
          if (!windowController) {
            return;
          }

          await windowController.restore();
        },
      },
      preview: createScreenshotPreviewDescriptor({
        title: 'Desktop preview',
      }),
      metadata: {
        executionUx: 'countdown-before-run',
        sessionConnected: false,
        setupState:
          initialAccessibility.hasPermission &&
          initialScreenRecording.hasPermission
            ? 'required'
            : 'blocked',
        setupBlockingReason:
          (!initialAccessibility.hasPermission && initialAccessibility.error) ||
          (!initialScreenRecording.hasPermission &&
            initialScreenRecording.error) ||
          undefined,
      },
    };
  },
});
