import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { readWindowsDisplayGeometries } from '../../src/windows-display';

const { execFileSync } = rs.hoisted(() => ({
  execFileSync: rs.fn(
    (_file: string, _args: string[], _options: unknown): string => '',
  ),
}));

rs.mock('node:child_process', () => ({ execFileSync }));

const primaryGeometry = {
  id: '\\\\.\\DISPLAY6',
  name: '\\\\.\\DISPLAY6',
  primary: true,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
};

afterEach(() => {
  execFileSync.mockReset();
});

describe('Windows display enumeration', () => {
  it('enumerates physical displays through plain Command with Per-Monitor V2', () => {
    const secondaryGeometry = {
      ...primaryGeometry,
      id: '\\\\.\\DISPLAY7',
      name: '\\\\.\\DISPLAY7',
      primary: false,
      bounds: { x: -2560, y: 0, width: 2560, height: 1440 },
    };
    const displays = [primaryGeometry, secondaryGeometry];
    execFileSync.mockReturnValue(JSON.stringify(displays));

    expect(readWindowsDisplayGeometries()).toEqual(displays);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [file, args] = execFileSync.mock.calls[0];
    expect(file).toBe('powershell.exe');
    expect(args.slice(0, 2)).toEqual(['-NoProfile', '-Command']);
    expect(args).not.toContain('-EncodedCommand');
    expect(args).not.toContain('-NonInteractive');
    expect(args[2]).toContain('SetThreadDpiAwarenessContext');
    expect(args[2]).toContain('[System.IntPtr](-4)');
    expect(args[2]).toContain('[System.Windows.Forms.Screen]::AllScreens');
  });

  it.each(['', '   ', '[]'])(
    'rejects empty output %j without retrying',
    (output) => {
      execFileSync.mockReturnValue(output);

      expect(() => readWindowsDisplayGeometries()).toThrow(
        /returned no (data|displays)/,
      );
      expect(execFileSync).toHaveBeenCalledTimes(1);
    },
  );

  it('propagates PowerShell failures without retrying', () => {
    const error = new Error('PowerShell failed');
    execFileSync.mockImplementation(() => {
      throw error;
    });

    expect(() => readWindowsDisplayGeometries()).toThrow(error);
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });

  it.each([
    '{',
    '{}',
    JSON.stringify([{ id: primaryGeometry.id }]),
    JSON.stringify([
      { ...primaryGeometry, bounds: { ...primaryGeometry.bounds, width: 0 } },
    ]),
  ])('rejects malformed display data %j without retrying', (output) => {
    execFileSync.mockReturnValue(output);

    expect(() => readWindowsDisplayGeometries()).toThrow();
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});
