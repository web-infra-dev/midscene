import type { Agent } from '@midscene/core/agent';
import type { LaunchPlaygroundOptions } from './launcher';
import type { AgentFactory } from './types';

export type PlaygroundPreviewKind =
  | 'none'
  | 'screenshot'
  | 'mjpeg'
  | 'scrcpy'
  | 'custom';

export interface PlaygroundPreviewCapability {
  kind: PlaygroundPreviewKind;
  label?: string;
  live?: boolean;
}

export interface PlaygroundPreviewDescriptor {
  kind: PlaygroundPreviewKind;
  title?: string;
  capabilities?: PlaygroundPreviewCapability[];
  screenshotPath?: string;
  mjpegPath?: string;
  custom?: Record<string, unknown>;
}

export interface PreparedPlaygroundPlatform {
  platformId: string;
  title: string;
  description?: string;
  agent?: Agent;
  agentFactory?: AgentFactory;
  launchOptions?: LaunchPlaygroundOptions;
  preview?: PlaygroundPreviewDescriptor;
  metadata?: Record<string, unknown>;
}

export interface PlaygroundPlatformDescriptor<TOptions = void> {
  id: string;
  title: string;
  description?: string;
  prepare(options: TOptions): Promise<PreparedPlaygroundPlatform>;
}

export function definePlaygroundPlatform<TOptions>(
  descriptor: PlaygroundPlatformDescriptor<TOptions>,
): PlaygroundPlatformDescriptor<TOptions> {
  return descriptor;
}

export function createScreenshotPreviewDescriptor(
  overrides: Partial<PlaygroundPreviewDescriptor> = {},
): PlaygroundPreviewDescriptor {
  return {
    kind: 'screenshot',
    screenshotPath: '/screenshot',
    capabilities: [
      {
        kind: 'screenshot',
        label: 'Screenshot polling',
        live: false,
      },
    ],
    ...overrides,
  };
}

export function createMjpegPreviewDescriptor(
  overrides: Partial<PlaygroundPreviewDescriptor> = {},
): PlaygroundPreviewDescriptor {
  return {
    kind: 'mjpeg',
    screenshotPath: '/screenshot',
    mjpegPath: '/mjpeg',
    capabilities: [
      {
        kind: 'mjpeg',
        label: 'MJPEG streaming',
        live: true,
      },
      {
        kind: 'screenshot',
        label: 'Screenshot fallback',
        live: false,
      },
    ],
    ...overrides,
  };
}

export function createScrcpyPreviewDescriptor(
  custom: Record<string, unknown> = {},
  overrides: Partial<PlaygroundPreviewDescriptor> = {},
): PlaygroundPreviewDescriptor {
  return {
    kind: 'scrcpy',
    screenshotPath: '/screenshot',
    capabilities: [
      {
        kind: 'scrcpy',
        label: 'scrcpy streaming',
        live: true,
      },
      {
        kind: 'screenshot',
        label: 'Screenshot fallback',
        live: false,
      },
    ],
    custom,
    ...overrides,
  };
}

export function resolvePreparedLaunchOptions(
  prepared: PreparedPlaygroundPlatform,
  overrides: LaunchPlaygroundOptions = {},
): LaunchPlaygroundOptions {
  return {
    ...(prepared.launchOptions || {}),
    ...overrides,
  };
}
