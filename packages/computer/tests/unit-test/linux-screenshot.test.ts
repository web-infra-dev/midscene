import { existsSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const screenshot = rs.hoisted(() => rs.fn());

rs.mock('screenshot-desktop', () => ({
  default: screenshot,
}));

const originalPlatform = process.platform;
const PNG = Buffer.from('png-content');

describe('Linux screenshots', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    screenshot.mockReset();
    rs.resetModules();
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
    const [options] = screenshot.mock.calls[0] as [
      { filename: string; format: string },
    ];
    expect(options.format).toBe('png');
    expect(options.filename).toContain('midscene-screenshot-');
    expect(options.filename).toMatch(/\.png$/);
    expect(existsSync(filename)).toBe(false);
  });
});
