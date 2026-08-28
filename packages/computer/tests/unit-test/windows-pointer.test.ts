import { describe, expect, it, rs } from '@rstest/core';
import {
  WindowsPointerDriver,
  windowsPointerDrift,
  windowsPointerIsWithinTolerance,
  windowsPointerMoveScript,
} from '../../src/windows-pointer';

describe('Windows screenshot-space pointer driver', () => {
  it('moves and observes through WinForms with the requested smooth path', () => {
    const runPowershell = rs.fn((_script: string) => '1395,50');
    const driver = new WindowsPointerDriver({ runPowershell });

    expect(
      driver.moveTo({ x: 1395, y: 50 }, { smoothSteps: 8, smoothDelayMs: 8 }),
    ).toEqual({ x: 1395, y: 50 });

    const script = runPowershell.mock.lastCall?.[0] ?? '';
    expect(script).toContain('$targetX = 1395');
    expect(script).toContain('$targetY = 50');
    expect(script).toContain('$smoothSteps = 8');
    expect(script).toContain('$smoothDelayMs = 8');
    expect(script).toContain('[System.Windows.Forms.Cursor]::Position');
    expect(script).not.toContain('Add-Type -TypeDefinition');
  });

  it('supports negative virtual-desktop coordinates for secondary displays', () => {
    expect(windowsPointerMoveScript({ x: -1000, y: 100 })).toContain(
      '$targetX = -1000',
    );
  });

  it('throws instead of accepting an unreadable cursor position', () => {
    const driver = new WindowsPointerDriver({
      runPowershell: () => '',
    });

    expect(() => driver.getPosition()).toThrow(/invalid cursor position/);
  });

  it('checks observed drift in screenshot coordinates', () => {
    const drift = windowsPointerDrift({ x: 1395, y: 50 }, { x: 1400, y: 55 });
    expect(drift).toEqual({ x: 5, y: 5 });
    expect(windowsPointerIsWithinTolerance(drift)).toBe(true);
    expect(windowsPointerIsWithinTolerance({ x: 6, y: 0 })).toBe(false);
  });
});
