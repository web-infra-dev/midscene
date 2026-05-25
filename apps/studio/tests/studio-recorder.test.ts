import { describe, expect, it } from 'vitest';
import { toStudioRecorderCodegenInput } from '../src/renderer/recorder/codegen-adapter';
import { mapPageRecorderEventToStudioRecordedEvent } from '../src/renderer/recorder/event-mapper';
import { generateStudioRecorderYaml } from '../src/renderer/recorder/export';
import { resolveStudioRecorderTarget } from '../src/renderer/recorder/selectors';
import type { StudioRecordingSession } from '../src/renderer/recorder/types';

describe('studio recorder selectors', () => {
  it('resolves web target metadata from runtime info and form values', () => {
    expect(
      resolveStudioRecorderTarget(
        {
          platformId: 'web',
          title: 'Midscene Web Playground',
          interface: { type: 'puppeteer' },
          preview: { kind: 'mjpeg' },
          executionUxHints: [],
          metadata: {
            url: 'https://example.com',
            sessionDisplayName: 'https://example.com',
          },
        },
        {
          platformId: 'web',
          'web.viewportWidth': 1280,
          'web.viewportHeight': 720,
        },
      ),
    ).toEqual({
      platformId: 'web',
      deviceId: 'https://example.com',
      label: 'https://example.com',
      values: {
        url: 'https://example.com',
        viewportWidth: 1280,
        viewportHeight: 720,
      },
    });
  });

  it('resolves platform-specific device targets', () => {
    expect(
      resolveStudioRecorderTarget(
        {
          platformId: 'android',
          interface: { type: 'android' },
          preview: { kind: 'scrcpy' },
          executionUxHints: [],
          metadata: { deviceId: 'emulator-5554' },
        },
        { platformId: 'android' },
      )?.values,
    ).toEqual({ deviceId: 'emulator-5554' });

    expect(
      resolveStudioRecorderTarget(
        {
          platformId: 'ios',
          interface: { type: 'ios' },
          preview: { kind: 'mjpeg' },
          executionUxHints: [],
          metadata: { wdaHost: '127.0.0.1', wdaPort: 8100 },
        },
        { platformId: 'ios' },
      )?.values,
    ).toEqual({ host: '127.0.0.1', port: 8100 });

    expect(
      resolveStudioRecorderTarget(
        {
          platformId: 'computer',
          interface: { type: 'computer' },
          preview: { kind: 'screenshot' },
          executionUxHints: [],
          metadata: { displayId: '1' },
        },
        { platformId: 'computer' },
      )?.values,
    ).toEqual({ displayId: '1' });
  });
});

describe('studio recorder event mapper', () => {
  it('maps injected page recorder events into studio recorded events', () => {
    const target = {
      platformId: 'web' as const,
      deviceId: 'https://example.com',
      label: 'https://example.com',
      values: { url: 'https://example.com' },
    };

    expect(
      mapPageRecorderEventToStudioRecordedEvent({
        target,
        event: {
          type: 'navigation',
          url: 'https://example.com/docs',
          title: 'Docs',
          pageInfo: { width: 1200, height: 800 },
          timestamp: 123,
          hashId: 'nav-1',
          screenshotAfter: 'after',
        },
      }),
    ).toMatchObject({
      type: 'navigation',
      platformId: 'web',
      actionType: 'Navigate',
      url: 'https://example.com/docs',
      title: 'Docs',
      screenshotAfter: 'after',
      target,
    });

    expect(
      mapPageRecorderEventToStudioRecordedEvent({
        target,
        event: {
          type: 'click',
          elementDescription: 'Introduction',
          elementRect: { x: 10, y: 20 },
          pageInfo: { width: 1200, height: 800 },
          timestamp: 124,
          hashId: 'click-1',
        },
      }),
    ).toMatchObject({
      type: 'click',
      actionType: 'Click',
      elementDescription: 'Introduction',
      elementRect: { x: 10, y: 20 },
    });
  });

  it('maps platform-native recorder events without DOM metadata', () => {
    const target = {
      platformId: 'computer' as const,
      deviceId: '2',
      label: 'DELL U2720Q',
      values: { displayId: '2' },
    };

    expect(
      mapPageRecorderEventToStudioRecordedEvent({
        target,
        event: {
          type: 'scroll',
          source: 'computer-native',
          actionType: 'Scroll',
          rawPayload: { deltaX: 0, deltaY: -285 },
          value: '0,-285',
          elementRect: { x: 112, y: 451 },
          pageInfo: { width: 1728, height: 1117 },
          timestamp: 125,
          hashId: 'scroll-1',
        },
      }),
    ).toMatchObject({
      type: 'scroll',
      platformId: 'computer',
      actionType: 'Scroll',
      rawPayload: {
        actionType: 'Scroll',
        deltaX: 0,
        deltaY: -285,
      },
      target,
    });
  });
});

describe('studio recorder export', () => {
  it('generates YAML with target metadata and recorded flow', () => {
    const session: StudioRecordingSession = {
      id: 'session-1',
      name: 'web recording',
      status: 'completed',
      createdAt: 1,
      updatedAt: 2,
      target: {
        platformId: 'web',
        label: 'Example',
        deviceId: 'https://example.com',
        values: { url: 'https://example.com' },
      },
      events: [
        {
          type: 'click',
          platformId: 'web',
          actionType: 'Tap',
          rawPayload: { actionType: 'Tap', x: 10, y: 20 },
          target: {
            platformId: 'web',
            label: 'Example',
            deviceId: 'https://example.com',
            values: { url: 'https://example.com' },
          },
          pageInfo: { width: 100, height: 100 },
          timestamp: 1,
          hashId: 'event-1',
          elementDescription: 'Tap at (10, 20)',
        },
      ],
    };

    expect(generateStudioRecorderYaml(session)).toContain(
      'url: "https://example.com"',
    );
    expect(generateStudioRecorderYaml(session)).toContain(
      '      - aiTap: "Tap at (10, 20)"',
    );
  });
});

describe('studio recorder codegen adapter', () => {
  it('maps a Studio session into platform-aware recorder codegen input', () => {
    const session: StudioRecordingSession = {
      id: 'session-1',
      name: 'computer recording',
      status: 'completed',
      createdAt: 1,
      updatedAt: 2,
      target: {
        platformId: 'computer',
        label: 'DELL U2720Q',
        deviceId: '2',
        values: { displayId: '2' },
      },
      events: [
        {
          type: 'click',
          platformId: 'computer',
          actionType: 'Click',
          rawPayload: { actionType: 'Click', x: 73, y: 1071 },
          target: {
            platformId: 'computer',
            label: 'DELL U2720Q',
            deviceId: '2',
            values: { displayId: '2' },
          },
          pageInfo: { width: 1080, height: 1920 },
          timestamp: 1,
          hashId: 'event-1',
        },
      ],
    };

    expect(toStudioRecorderCodegenInput(session)).toMatchObject({
      target: {
        platformId: 'computer',
        values: { displayId: '2' },
      },
      testName: 'computer recording',
      events: [expect.objectContaining({ hashId: 'event-1' })],
      includeTimestamps: true,
      maxScreenshots: 5,
    });
  });
});
