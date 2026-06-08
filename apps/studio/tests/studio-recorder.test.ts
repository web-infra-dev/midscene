import { DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS } from '@midscene/shared/recorder';
import { describe, expect, it } from 'vitest';
import { toStudioRecorderCodegenInput } from '../src/renderer/recorder/codegen-adapter';
import { mapPreviewRecorderEventToStudioRecordedEvent } from '../src/renderer/recorder/event-mapper';
import { generateStudioRecorderYaml } from '../src/renderer/recorder/export';
import {
  createRecorderMarkdownReplayRequest,
  getRecorderYamlReplayContent,
} from '../src/renderer/recorder/replay';
import {
  filterStudioRecorderSessionsForTarget,
  resolveStudioRecorderTarget,
} from '../src/renderer/recorder/selectors';
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

  it('filters recording history by the current target', () => {
    const webTarget = {
      platformId: 'web' as const,
      deviceId: 'https://example.com',
      label: 'Example',
      values: { url: 'https://example.com' },
    };
    const androidTarget = {
      platformId: 'android' as const,
      deviceId: 'emulator-5554',
      label: 'Pixel',
      values: { deviceId: 'emulator-5554' },
    };
    const sessions = [
      {
        id: 'web-session',
        name: 'web',
        status: 'completed' as const,
        createdAt: 1,
        updatedAt: 1,
        target: webTarget,
        events: [],
      },
      {
        id: 'android-session',
        name: 'android',
        status: 'completed' as const,
        createdAt: 2,
        updatedAt: 2,
        target: androidTarget,
        events: [],
      },
    ];

    expect(
      filterStudioRecorderSessionsForTarget(sessions, androidTarget).map(
        (session) => session.id,
      ),
    ).toEqual(['android-session']);
    expect(filterStudioRecorderSessionsForTarget(sessions, null)).toEqual([]);
  });
});

describe('studio recorder event mapper', () => {
  it('maps preview recorder events into studio recorded events', () => {
    const target = {
      platformId: 'web' as const,
      deviceId: 'https://example.com',
      label: 'https://example.com',
      values: { url: 'https://example.com' },
    };

    expect(
      mapPreviewRecorderEventToStudioRecordedEvent({
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
      mapPreviewRecorderEventToStudioRecordedEvent({
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

  it('maps preview recorder events without DOM metadata', () => {
    const target = {
      platformId: 'computer' as const,
      deviceId: '2',
      label: 'DELL U2720Q',
      values: { displayId: '2' },
    };

    expect(
      mapPreviewRecorderEventToStudioRecordedEvent({
        target,
        event: {
          type: 'scroll',
          source: 'studio-preview',
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

    const input = toStudioRecorderCodegenInput(session);
    expect(input).toMatchObject({
      target: {
        platformId: 'computer',
        values: { displayId: '2' },
      },
      testName: 'computer recording',
      events: [expect.objectContaining({ hashId: 'event-1' })],
      includeTimestamps: true,
      maxScreenshots: DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
    });
    expect(input.events[0]).not.toHaveProperty('target');
    expect(input.events[0]).not.toHaveProperty('platformId');
    expect(input.events[0]).not.toHaveProperty('rawPayload');
  });
});

describe('studio recorder replay adapters', () => {
  it('creates a Markdown replay request from AI generated Markdown and screenshots', () => {
    const session: StudioRecordingSession = {
      id: 'session-1',
      name: 'Replay login',
      status: 'completed',
      createdAt: 1,
      updatedAt: 2,
      target: {
        platformId: 'web',
        label: 'Web',
        deviceId: 'https://example.com',
        values: { url: 'https://example.com' },
      },
      events: [
        {
          type: 'click',
          platformId: 'web',
          actionType: 'Click',
          rawPayload: {},
          target: {
            platformId: 'web',
            label: 'Web',
            deviceId: 'https://example.com',
            values: { url: 'https://example.com' },
          },
          pageInfo: { width: 1280, height: 720 },
          timestamp: 1,
          hashId: 'click-1',
          screenshotWithBox:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
        },
      ],
      generatedCode: {
        markdown: '# Replay login\n\n## Steps\n1. Tap login\n',
      },
    };

    expect(createRecorderMarkdownReplayRequest(session)).toMatchObject({
      markdown: '# Replay login\n\n## Steps\n1. Tap login\n',
      screenshots: [
        {
          relativePath: './screenshots/event-001-click.png',
          base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
        },
      ],
    });
  });

  it('requires AI generated replay artifacts', () => {
    const session: StudioRecordingSession = {
      id: 'session-1',
      name: 'Replay login',
      status: 'completed',
      createdAt: 1,
      updatedAt: 2,
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [],
    };

    expect(() => createRecorderMarkdownReplayRequest(session)).toThrow(
      'Generate Markdown before replay.',
    );
    expect(() => getRecorderYamlReplayContent(session)).toThrow(
      'Generate YAML before replay.',
    );
  });
});
