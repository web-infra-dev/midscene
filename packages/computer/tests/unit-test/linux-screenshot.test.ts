import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const screenshot = vi.hoisted(() => vi.fn());

vi.mock('screenshot-desktop', () => ({
  default: screenshot,
}));

const originalPlatform = process.platform;
const PNG = Buffer.from('png-content');

describe('Linux screenshots', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    screenshot.mockReset();
    vi.resetModules();
  });

  it('captures to a temporary file instead of screenshot-desktop stdout', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    let filename = '';
    screenshot.mockImplementation(async (options: { filename: string }) => {
      filename = options.filename;
      writeFileSync(filename, PNG);
      return filename;
    });

    const { ComputerDevice } = await import('../../src/device');
    const device = new ComputerDevice({});

    await expect(device.screenshotBase64()).resolves.toBe(
      `data:image/png;base64,${PNG.toString('base64')}`,
    );
    expect(screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: expect.stringMatching(
          new RegExp(`^${tmpdir()}/midscene-screenshot-.*\\.png$`),
        ),
        format: 'png',
      }),
    );
    expect(existsSync(filename)).toBe(false);
  });
});
