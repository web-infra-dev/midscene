import { ScreenshotItem } from '@midscene/core';
import type { Agent } from '@midscene/core/agent';
import {
  type AgentFactory,
  type LaunchPlaygroundOptions,
  type PlaygroundPreviewDescriptor,
  createScreenshotPreviewDescriptor,
  definePlaygroundPlatform,
} from '@midscene/playground';
import { StaticPage, StaticPageAgent } from './static';

export interface WebPlatformOptions {
  agent?: Agent;
  agentFactory?: AgentFactory;
  title?: string;
  preview?: PlaygroundPreviewDescriptor;
  launchOptions?: LaunchPlaygroundOptions;
}

function createDefaultWebAgent(): StaticPageAgent {
  const page = new StaticPage({
    shotSize: { width: 800, height: 600 },
    screenshot: ScreenshotItem.create('', Date.now()),
    shrunkShotToLogicalRatio: 1,
  });

  return new StaticPageAgent(page);
}

export const webPlaygroundPlatform = definePlaygroundPlatform<
  WebPlatformOptions | undefined
>({
  id: 'web',
  title: 'Midscene Web Playground',
  description: 'Web playground platform descriptor',
  async prepare(options) {
    const agent = options?.agent;
    const agentFactory =
      options?.agentFactory ||
      (!options?.agent && !options?.agentFactory
        ? () => createDefaultWebAgent()
        : undefined);

    return {
      platformId: 'web',
      title: options?.title || 'Midscene Web Playground',
      agent: agent || (!agentFactory ? createDefaultWebAgent() : undefined),
      agentFactory,
      launchOptions: options?.launchOptions,
      preview:
        options?.preview ||
        createScreenshotPreviewDescriptor({
          title: 'Web page preview',
        }),
      metadata: {
        interfaceType: agent?.interface?.interfaceType || 'web',
      },
    };
  },
});
