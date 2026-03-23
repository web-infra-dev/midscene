import { describe, expect, test, vi } from 'vitest';

vi.mock('@midscene/playground', () => ({
  createScreenshotPreviewDescriptor: (overrides = {}) => ({
    kind: 'screenshot',
    screenshotPath: '/screenshot',
    ...overrides,
  }),
  definePlaygroundPlatform: (descriptor: unknown) => descriptor,
}));

vi.mock('@midscene/shared/node', () => ({
  findAvailablePort: vi.fn().mockResolvedValue(5810),
}));

import { harmonyPlaygroundPlatform } from '../../src/platform';

describe('harmonyPlaygroundPlatform', () => {
  test('prepare returns typed launch options when a device id is provided', async () => {
    const prepared = await harmonyPlaygroundPlatform.prepare({
      deviceId: 'SERIAL123',
      staticDir: '/tmp/harmony-static',
    });

    expect(prepared.platformId).toBe('harmony');
    expect(prepared.metadata).toMatchObject({
      deviceId: 'SERIAL123',
    });
    expect(prepared.launchOptions).toMatchObject({
      port: 5810,
      staticPath: '/tmp/harmony-static',
      openBrowser: false,
      verbose: false,
    });
    expect(prepared.preview).toMatchObject({
      kind: 'screenshot',
    });
  });
});
