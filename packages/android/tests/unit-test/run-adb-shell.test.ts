import { describe, expect, it, vi } from 'vitest';
import { AndroidDevice } from '../../src/device';

describe('RunAdbShell action', () => {
  it('passes timeout option to adb.shell when provided', async () => {
    const device = new AndroidDevice('test-device');
    const shell = vi.fn().mockResolvedValue('shell output');
    vi.spyOn(device, 'getAdb').mockResolvedValue({ shell } as any);

    const action = device
      .actionSpace()
      .find((item) => item.name === 'RunAdbShell');

    await expect(
      action?.call({ command: 'sleep 2', timeout: 2_000 }, {} as any),
    ).resolves.toBe('shell output');

    expect(shell).toHaveBeenCalledWith('sleep 2', { timeout: 2_000 });
  });

  it('keeps the original adb.shell call shape when timeout is omitted', async () => {
    const device = new AndroidDevice('test-device');
    const shell = vi.fn().mockResolvedValue('shell output');
    vi.spyOn(device, 'getAdb').mockResolvedValue({ shell } as any);

    const action = device
      .actionSpace()
      .find((item) => item.name === 'RunAdbShell');

    await expect(
      action?.call({ command: 'dumpsys battery' }, {} as any),
    ).resolves.toBe('shell output');

    expect(shell).toHaveBeenCalledWith('dumpsys battery');
  });
});
