import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockScreenshot = Object.assign(vi.fn(), {
  listDisplays: vi.fn(),
});
const mockExecFile = vi.fn();
const mockReadFile = vi.fn();
const mockUnlink = vi.fn();

vi.mock('screenshot-desktop', () => ({
  default: mockScreenshot,
}));

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: (...args: unknown[]) => mockReadFile(...args),
      unlink: (...args: unknown[]) => mockUnlink(...args),
    },
  };
});

const { ComputerDevice } = await import('../../src/device');

describe('ComputerDevice screenshot fallback', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockScreenshot.mockReset();
    mockScreenshot.listDisplays.mockReset();
    mockExecFile.mockReset();
    mockReadFile.mockReset();
    mockUnlink.mockReset();
    mockUnlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should use a DPI-aware PowerShell fallback when screenshot-desktop fails on Windows', async () => {
    const fallbackBuffer = Buffer.from('fallback-png');
    mockScreenshot.mockRejectedValueOnce(new Error('primary failed'));
    mockExecFile.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, '', '');
        return {} as never;
      },
    );
    mockReadFile.mockResolvedValueOnce(fallbackBuffer);

    const device = new ComputerDevice({ displayId: '\\\\.\\DISPLAY2' });
    const screenshotBase64 = await device.screenshotBase64();

    expect(screenshotBase64).toBe(
      `data:image/png;base64,${fallbackBuffer.toString('base64')}`,
    );
    expect(mockScreenshot).toHaveBeenCalledWith({
      format: 'png',
      screen: '\\\\.\\DISPLAY2',
    });

    const [command, args] = mockExecFile.mock.calls[0] as [string, string[]];
    const encodedScript = args[3];
    const script = Buffer.from(encodedScript, 'base64').toString('utf16le');

    expect(command).toBe('powershell.exe');
    expect(script).toContain('SetProcessDpiAwarenessContext');
    expect(script).toContain('SetProcessDPIAware');
    expect(script).toContain('DISPLAY2');
    expect(script.indexOf('SetProcessDpiAwarenessContext')).toBeLessThan(
      script.indexOf('[System.Windows.Forms.Screen]::AllScreens'),
    );
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });
});
