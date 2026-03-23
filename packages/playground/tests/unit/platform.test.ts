import { describe, expect, test } from 'vitest';
import {
  createMjpegPreviewDescriptor,
  createScrcpyPreviewDescriptor,
  createScreenshotPreviewDescriptor,
  definePlaygroundPlatform,
  resolvePreparedLaunchOptions,
} from '../../src/platform';

describe('platform descriptors', () => {
  test('definePlaygroundPlatform preserves descriptor shape', async () => {
    const descriptor = definePlaygroundPlatform({
      id: 'test',
      title: 'Test Platform',
      async prepare() {
        return {
          platformId: 'test',
          title: 'Test Platform',
          preview: createScreenshotPreviewDescriptor(),
        };
      },
    });

    expect(descriptor.id).toBe('test');
    await expect(descriptor.prepare()).resolves.toMatchObject({
      platformId: 'test',
      title: 'Test Platform',
      preview: {
        kind: 'screenshot',
        screenshotPath: '/screenshot',
      },
    });
  });

  test('resolvePreparedLaunchOptions merges overrides after prepared defaults', () => {
    const options = resolvePreparedLaunchOptions(
      {
        platformId: 'android',
        title: 'Android',
        launchOptions: {
          openBrowser: false,
          port: 5800,
        },
      },
      {
        port: 5900,
      },
    );

    expect(options).toMatchObject({
      openBrowser: false,
      port: 5900,
    });
  });

  test('preview descriptor helpers expose expected defaults', () => {
    expect(createScreenshotPreviewDescriptor()).toMatchObject({
      kind: 'screenshot',
      screenshotPath: '/screenshot',
    });

    expect(createMjpegPreviewDescriptor()).toMatchObject({
      kind: 'mjpeg',
      screenshotPath: '/screenshot',
      mjpegPath: '/mjpeg',
    });

    expect(
      createScrcpyPreviewDescriptor({
        serverUrl: 'http://localhost:6001',
      }),
    ).toMatchObject({
      kind: 'scrcpy',
      screenshotPath: '/screenshot',
      custom: {
        serverUrl: 'http://localhost:6001',
      },
    });
  });
});
