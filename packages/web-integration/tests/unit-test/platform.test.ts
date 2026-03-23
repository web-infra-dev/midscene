import { describe, expect, test } from 'vitest';
import { webPlaygroundPlatform } from '../../src/platform';
import { StaticPageAgent } from '../../src/static';

describe('webPlaygroundPlatform', () => {
  test('creates a default static web playground agent when none is provided', async () => {
    const prepared = await webPlaygroundPlatform.prepare();

    expect(prepared.platformId).toBe('web');
    expect(prepared.agent).toBeInstanceOf(StaticPageAgent);
    expect(prepared.preview).toMatchObject({
      kind: 'screenshot',
      screenshotPath: '/screenshot',
    });
  });

  test('preserves custom launch options and title overrides', async () => {
    const prepared = await webPlaygroundPlatform.prepare({
      title: 'Custom Web Playground',
      launchOptions: {
        port: 5807,
        openBrowser: true,
      },
    });

    expect(prepared.title).toBe('Custom Web Playground');
    expect(prepared.launchOptions).toMatchObject({
      port: 5807,
      openBrowser: true,
    });
  });
});
