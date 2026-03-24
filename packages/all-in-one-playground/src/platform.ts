import path from 'node:path';
import {
  type AndroidPlatformOptions,
  androidPlaygroundPlatform,
} from '@midscene/android-playground';
import type {
  BrowserWindowController,
  ComputerPlatformOptions,
} from '@midscene/computer-playground';
import { computerPlaygroundPlatform } from '@midscene/computer-playground';
import type { Agent } from '@midscene/core/agent';
import { harmonyPlaygroundPlatform } from '@midscene/harmony';
import { iosPlaygroundPlatform } from '@midscene/ios';
import {
  type AgentFactory,
  type PreparedPlaygroundPlatform,
  type RegisteredPlaygroundPlatform,
  createScreenshotPreviewDescriptor,
  definePlaygroundPlatform,
  playgroundForPlatforms,
  prepareMultiPlatformPlayground,
} from '@midscene/playground';
import { webPlaygroundPlatform } from '@midscene/web';

type HarmonyPlatformOptions = Parameters<
  typeof harmonyPlaygroundPlatform.prepare
>[0];
type IOSPlatformOptions = Parameters<typeof iosPlaygroundPlatform.prepare>[0];
type WebPlatformOptions = Parameters<typeof webPlaygroundPlatform.prepare>[0];

export type BuiltInPlatformId =
  | 'android'
  | 'computer'
  | 'harmony'
  | 'ios'
  | 'web';

export interface AllInOnePlatformRegistration<TOptions = unknown> {
  id: BuiltInPlatformId | (string & {});
  label: string;
  description?: string;
  supportsStandalone?: boolean;
  frontendBranding?: {
    title: string;
    targetName: string;
  };
  unavailableReason?: string;
  prepare: (options?: TOptions) => Promise<PreparedPlaygroundPlatform>;
  options?: TOptions;
}

export interface AllInOnePlaygroundPlatformOptions {
  staticDir?: string;
  android?: AndroidPlatformOptions;
  computer?: ComputerPlatformOptions;
  harmony?: HarmonyPlatformOptions;
  ios?: IOSPlatformOptions;
  web?: WebPlatformOptions;
  platforms?: AllInOnePlatformRegistration[];
}

export function createAllInOnePlatformRegistry(
  options: AllInOnePlaygroundPlatformOptions = {},
): AllInOnePlatformRegistration[] {
  if (options.platforms?.length) {
    return options.platforms;
  }

  const staticDir = options.staticDir || path.join(__dirname, '../../static');
  const webConfigured = Boolean(
    options.web?.agent || options.web?.agentFactory,
  );

  return [
    {
      id: 'android',
      label: 'Android',
      description: 'Connect an Android device over ADB.',
      supportsStandalone: true,
      frontendBranding: {
        title: 'Android Playground',
        targetName: 'android',
      },
      prepare: () =>
        androidPlaygroundPlatform.prepare({
          ...options.android,
          staticDir,
        }),
      options: options.android,
    },
    {
      id: 'computer',
      label: 'Computer',
      description: 'Control a desktop display.',
      supportsStandalone: true,
      frontendBranding: {
        title: 'Computer Playground',
        targetName: 'computer',
      },
      prepare: () =>
        computerPlaygroundPlatform.prepare({
          ...options.computer,
          staticDir,
        }),
      options: options.computer,
    },
    {
      id: 'ios',
      label: 'iOS',
      description: 'Connect to a running WebDriverAgent target.',
      supportsStandalone: true,
      frontendBranding: {
        title: 'iOS Playground',
        targetName: 'ios',
      },
      prepare: () =>
        iosPlaygroundPlatform.prepare({
          ...options.ios,
          staticDir,
        }),
      options: options.ios,
    },
    {
      id: 'harmony',
      label: 'HarmonyOS',
      description: 'Connect a HarmonyOS device over HDC.',
      supportsStandalone: true,
      frontendBranding: {
        title: 'HarmonyOS Playground',
        targetName: 'harmony',
      },
      prepare: () =>
        harmonyPlaygroundPlatform.prepare({
          ...options.harmony,
          staticDir,
        }),
      options: options.harmony,
    },
    {
      id: 'web',
      label: 'Web',
      description: 'Reuse an externally provided web agent.',
      supportsStandalone: false,
      frontendBranding: {
        title: 'Web Playground',
        targetName: 'web page',
      },
      unavailableReason: webConfigured
        ? undefined
        : 'Requires an injected web agent or agentFactory.',
      prepare: () =>
        webPlaygroundPlatform.prepare({
          ...options.web,
          launchOptions: {
            openBrowser: false,
            verbose: false,
            ...(options.web?.launchOptions || {}),
          },
        }),
      options: options.web,
    },
  ];
}

function normalizePreparedPlatform(
  prepared: PreparedPlaygroundPlatform,
): PreparedPlaygroundPlatform {
  if (prepared.platformId !== 'android') {
    return prepared;
  }

  if (prepared.preview?.kind !== 'scrcpy') {
    return prepared;
  }

  return {
    ...prepared,
    preview: createScreenshotPreviewDescriptor({
      title: prepared.preview.title || 'Android device preview',
    }),
  };
}

function toRegisteredPlatforms(
  registry: AllInOnePlatformRegistration[],
): RegisteredPlaygroundPlatform[] {
  return registry.map((platform) => ({
    id: platform.id,
    label: platform.label,
    description: platform.description,
    supportsStandalone: platform.supportsStandalone,
    unavailableReason: platform.unavailableReason,
    metadata: platform.frontendBranding,
    options: platform.options,
    prepare: async (options) =>
      normalizePreparedPlatform(await platform.prepare(options)),
  }));
}

export async function createAllInOnePreparedPlayground(
  options: AllInOnePlaygroundPlatformOptions = {},
) {
  const registry = toRegisteredPlatforms(
    createAllInOnePlatformRegistry(options),
  );

  return prepareMultiPlatformPlayground(registry, {
    platformId: 'all-in-one',
    title: 'Midscene All-in-One Playground',
    description: 'Unified playground for web, mobile, and desktop targets',
    selectorFieldKey: 'platformId',
    selectorVariant: 'cards',
    launchOptions: {
      openBrowser: false,
      verbose: false,
      staticPath: options.staticDir || path.join(__dirname, '../../static'),
    },
  });
}

export function createAllInOnePlaygroundLauncher(
  options: AllInOnePlaygroundPlatformOptions = {},
) {
  const registry = toRegisteredPlatforms(
    createAllInOnePlatformRegistry(options),
  );

  return playgroundForPlatforms(registry, {
    platformId: 'all-in-one',
    title: 'Midscene All-in-One Playground',
    description: 'Unified playground for web, mobile, and desktop targets',
    selectorFieldKey: 'platformId',
    selectorVariant: 'cards',
    launchOptions: {
      openBrowser: false,
      verbose: false,
      staticPath: options.staticDir || path.join(__dirname, '../../static'),
    },
  });
}

export function createAllInOnePlaygroundPlatform() {
  return definePlaygroundPlatform<
    AllInOnePlaygroundPlatformOptions | undefined
  >({
    id: 'all-in-one',
    title: 'Midscene All-in-One Playground',
    description: 'Unified playground platform descriptor',
    async prepare(options: AllInOnePlaygroundPlatformOptions | undefined) {
      return createAllInOnePreparedPlayground(options);
    },
  });
}

export const allInOnePlaygroundPlatform = createAllInOnePlaygroundPlatform();

export type { Agent, AgentFactory, BrowserWindowController };
