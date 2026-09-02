import { describe, expect, it, rs } from '@rstest/core';
import {
  WindowsPointerDriver,
  windowsActiveWindowRectScript,
  windowsPointerDrift,
  windowsPointerIsWithinTolerance,
  windowsPointerMoveScript,
} from '../../src/windows-pointer';

describe('Windows screenshot-space pointer driver', () => {
  it('moves and observes physical pixels with the requested smooth path', () => {
    const runPhysicalPixelPowershell = rs.fn((_script: string) => '1395,50');
    const driver = new WindowsPointerDriver({ runPhysicalPixelPowershell });

    expect(
      driver.moveTo({ x: 1395, y: 50 }, { smoothSteps: 8, smoothDelayMs: 8 }),
    ).toEqual({ x: 1395, y: 50 });

    const script = runPhysicalPixelPowershell.mock.lastCall?.[0] ?? '';
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
      runPhysicalPixelPowershell: () => '',
    });

    expect(() => driver.getPosition()).toThrow(/invalid cursor position/);
  });

  it('reads the active window rectangle through the physical-pixel runner', () => {
    const runPhysicalPixelPowershell = rs.fn(() => '-1200,100,800,600');
    const driver = new WindowsPointerDriver({ runPhysicalPixelPowershell });

    expect(driver.getActiveWindowRect()).toEqual({
      x: -1200,
      y: 100,
      width: 800,
      height: 600,
    });
    expect(runPhysicalPixelPowershell).toHaveBeenCalledWith(
      windowsActiveWindowRectScript(),
    );
  });

  it('rejects malformed active window geometry', () => {
    const driver = new WindowsPointerDriver({
      runPhysicalPixelPowershell: () => '0,0,0,600',
    });

    expect(() => driver.getActiveWindowRect()).toThrow(/invalid rectangle/);
  });

  it('checks observed drift in screenshot coordinates', () => {
    const drift = windowsPointerDrift({ x: 1395, y: 50 }, { x: 1400, y: 55 });
    expect(drift).toEqual({ x: 5, y: 5 });
    expect(windowsPointerIsWithinTolerance(drift)).toBe(true);
    expect(windowsPointerIsWithinTolerance({ x: 6, y: 0 })).toBe(false);
  });
});
