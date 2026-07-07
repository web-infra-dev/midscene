import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A 1x1 PNG, base64-encoded, as PowerShell's CopyFromScreen path would print
// to stdout.
const FAKE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Typed params so `mock.calls[i]` is a `[file, args, options]` tuple the type
// checker can index into.
const execFileSync = vi.fn(
  (_file: string, _args: string[], _options?: unknown): string =>
    FAKE_PNG_BASE64,
);

vi.mock('node:child_process', () => ({
  execFileSync: (file: string, args: string[], options?: unknown) =>
    execFileSync(file, args, options),
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

/** Decode the -EncodedCommand argument back to the PowerShell script. */
function decodeEncodedCommand(call: [string, string[], unknown?]): string {
  const args = call[1];
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

    // ExecutionPolicy only gates .ps1 files, not -EncodedCommand input, so it
    // must not be passed.
    const args = execFileSync.mock.calls[0][1] as string[];
    expect(args).not.toContain('-ExecutionPolicy');
    expect(args).not.toContain('Bypass');

    // Without a displayId the script falls back to the primary screen and
    // never does a lookup that could fail.
    const script = decodeEncodedCommand(execFileSync.mock.calls[0]);
    expect(script).toContain('CopyFromScreen');
    expect(script).toContain('PrimaryScreen');
    expect(script).not.toContain('throw');

    // No runtime C# compile: this PR's whole point is to drop the .NET
    // compiler dependency, so the DPI Add-Type/csc path must not reappear.
    expect(script).not.toContain('SetProcessDPIAware');
    expect(script).not.toContain('DllImport');
  });

  it('targets the requested display by DeviceName and fails fast if missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { ComputerDevice } = await import('../../src/device');

    const device = new ComputerDevice({ displayId: '\\\\.\\DISPLAY2' });
    await device.screenshotBase64();

    const script = decodeEncodedCommand(execFileSync.mock.calls[0]);
    expect(script).toContain('DeviceName -eq $dn');
    expect(script).toContain("$dn = '\\\\.\\DISPLAY2'");
    // A requested-but-missing display must throw, not fall back to primary.
    expect(script).toContain('throw "Requested display not found');
    expect(script).not.toContain('PrimaryScreen');
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
