import { z } from '@midscene/core';
import { type IOSAgent, agentFromWebDriverAgent } from '@midscene/ios';
import { parseBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { BaseMidsceneTools, type ToolDefinition } from '@midscene/shared/mcp';

const debug = getDebug('mcp:ios-tools');

/**
 * iOS-specific tools manager
 * Extends BaseMidsceneTools to provide iOS WebDriverAgent connection tools
 */
export class IOSMidsceneTools extends BaseMidsceneTools {
  protected getDefaultActionSpace() {
    // Provide default iOS action space when WebDriverAgent is not connected
    return [
      { name: 'Tap', description: 'Tap the element' },
      { name: 'DoubleClick', description: 'Double click the element' },
      { name: 'Input', description: 'Input text into the input field' },
      { name: 'Scroll', description: 'Scroll the page or an element' },
      { name: 'DragAndDrop', description: 'Drag and drop the element' },
      { name: 'KeyboardPress', description: 'Press a key or key combination' },
      { name: 'IOSLongPress', description: 'Trigger a long press on iOS devices' },
      { name: 'IOSPull', description: 'Trigger pull down to refresh or pull up actions' },
      { name: 'ClearInput', description: 'Clear the input field' },
      { name: 'Launch', description: 'Launch an iOS app or URL' },
      { name: 'IOSBackButton', description: 'Trigger the system "back" operation on iOS devices' },
      { name: 'IOSHomeButton', description: 'Trigger the system "home" operation on iOS devices' },
    ];
  }

  protected createTemporaryDevice() {
    // Import IOSDevice class
    const { IOSDevice } = require('@midscene/ios');
    // Create minimal temporary instance without connecting to WebDriverAgent
    // The constructor only initializes WDA backend, doesn't establish connection
    return new IOSDevice({});
  }

  protected async ensureAgent(): Promise<IOSAgent> {
    if (this.agent) {
      return this.agent;
    }

    debug('Creating iOS agent with WebDriverAgent');
    this.agent = await agentFromWebDriverAgent();
    return this.agent;
  }

  /**
   * Provide iOS-specific platform tools
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [
      {
        name: 'ios_connect',
        description:
          'Connect to iOS device or simulator via WebDriverAgent and optionally launch an app',
        schema: {
          uri: z
            .string()
            .optional()
            .describe(
              'Optional URI to launch app (e.g., http://example.com for URL, or com.example.app for bundle ID)',
            ),
        },
        handler: async ({ uri }: { uri?: string }) => {
          const agent = await this.ensureAgent();

          // If URI is provided, launch the app
          if (uri) {
            await agent.page.launch(uri);

            // Wait for app to finish loading using AI-driven polling
            await agent.aiWaitFor(
              'the app has finished loading and is ready to use',
              {
                timeoutMs: 10000,
                checkIntervalMs: 2000,
              },
            );
          }

          const screenshot = await agent.page.screenshotBase64();
          const { mimeType, body } = parseBase64(screenshot);

          return {
            content: [
              {
                type: 'text',
                text: `Connected to iOS device${uri ? ` and launched: ${uri} (app ready)` : ''}`,
              },
              {
                type: 'image',
                data: body,
                mimeType,
              },
            ],
            isError: false,
          };
        },
        autoDestroy: false,
      },
    ];
  }
}
