import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A 1x1 PNG, base64-encoded, as PowerShell's CopyFromScreen path would print
// to stdout.
const FAKE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const execFileSync = vi.fn(() => FAKE_PNG_BASE64);

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...args),
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

/** Decode the -EncodedCommand argument back to the PowerShell script. */
function decodeEncodedCommand(call: unknown[]): string {
  const args = call[1] as string[];
  const idx = args.indexOf('-EncodedCommand');
  return Buffer.from(args[idx + 1], 'base64').toString('utf16le');
}

describe('Windows screenshot via PowerShell (issue #2150)', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    execFileSync.mockClear();
    vi.resetModules();
  });

  it('captures through powershell.exe and returns a PNG data URI', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { ComputerDevice } = await import('../../src/device');

    const device = new ComputerDevice({});
    const base64 = await device.screenshotBase64();

    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(execFileSync.mock.calls[0][0]).toBe('powershell.exe');
    expect(base64).toBe(`data:image/png;base64,${FAKE_PNG_BASE64}`);

    // Without a displayId the script falls back to the primary screen.
    const script = decodeEncodedCommand(execFileSync.mock.calls[0]);
    expect(script).toContain('CopyFromScreen');
    expect(script).toContain('PrimaryScreen');
  });

  it('targets the requested display by DeviceName', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { ComputerDevice } = await import('../../src/device');

    const device = new ComputerDevice({ displayId: '\\\\.\\DISPLAY2' });
    await device.screenshotBase64();

    const script = decodeEncodedCommand(execFileSync.mock.calls[0]);
    expect(script).toContain("DeviceName -eq '\\\\.\\DISPLAY2'");
  });

  it('throws when PowerShell returns no image data', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execFileSync.mockReturnValueOnce('   ');
    const { ComputerDevice } = await import('../../src/device');

    const device = new ComputerDevice({});
    await expect(device.screenshotBase64()).rejects.toThrow(
      /returned no image data/,
    );
  });
});
