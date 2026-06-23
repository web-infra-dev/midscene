import { describe, expect, it, vi } from 'vitest';
import { LIBNUT_FALLBACK_EDGE_DETENTS } from '../../src/device';
import { ComputerInputDriver, type LibNut } from '../../src/input-driver';

function makeDriver(scrollMouse = vi.fn()) {
  const lib: LibNut = {
    getScreenSize: () => ({ width: 1, height: 1 }),
    getMousePos: () => ({ x: 0, y: 0 }),
    moveMouse: vi.fn(),
    mouseClick: vi.fn(),
    mouseToggle: vi.fn(),
    scrollMouse,
    keyTap: vi.fn(),
    typeString: vi.fn(),
  };
  const driver = new ComputerInputDriver({
    getLibnut: () => lib,
    useAppleScript: () => false,
    sendKeyViaAppleScript: vi.fn(),
    runPhasedScroll: vi.fn().mockReturnValue(false),
    debug: vi.fn(),
  });
  return { driver, scrollMouse };
}

describe('ComputerInputDriver.emitScrollDetents', () => {
  it('emits one libnut.scrollMouse call per detent', async () => {
    const { driver, scrollMouse } = makeDriver();
    await driver.emitScrollDetents(0, -120, 6, 0);
    expect(scrollMouse).toHaveBeenCalledTimes(6);
    for (const call of scrollMouse.mock.calls) {
      expect(call).toEqual([0, -120]);
    }
  });

  it('paces calls with the requested delay between them', async () => {
    vi.useFakeTimers();
    try {
      const { driver, scrollMouse } = makeDriver();
      const promise = driver.emitScrollDetents(0, -120, 3, 50);

      // First call fires synchronously before any delay.
      expect(scrollMouse).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(50);
      expect(scrollMouse).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(50);
      expect(scrollMouse).toHaveBeenCalledTimes(3);

      // No trailing delay after the last detent — the resolution scheduler
      // still needs a microtask flush, but no further timer advance.
      await promise;
      expect(scrollMouse).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes through dx for horizontal scroll', async () => {
    const { driver, scrollMouse } = makeDriver();
    await driver.emitScrollDetents(120, 0, 2, 0);
    expect(scrollMouse.mock.calls).toEqual([
      [120, 0],
      [120, 0],
    ]);
  });

  it('edge-scroll fallback aims for the full boundary distance', () => {
    // Regression: the first cut of this refactor wired edge scrolls to
    // SCROLL_REPEAT_COUNT (10) detents, which at 100 px/detent is only
    // ~1000 px — long pages stopped far short of the top/bottom. The
    // libnut fallback has to target the same EDGE_SCROLL_TOTAL_PX
    // (50_000 px) the phased path uses, capped at the per-platform
    // safety ceiling so a bad screen size can't wedge the process.
    expect(LIBNUT_FALLBACK_EDGE_DETENTS).toBeGreaterThanOrEqual(200);
  });

  it('rejects in-flight detents when the driver is destroyed mid-scroll', async () => {
    vi.useFakeTimers();
    try {
      const { driver, scrollMouse } = makeDriver();
      const promise = driver.emitScrollDetents(0, -120, 5, 50);
      // First call already happened.
      expect(scrollMouse).toHaveBeenCalledTimes(1);
      driver.destroy();
      await expect(promise).rejects.toThrow(/destroyed/);
      // No further calls after destroy().
      await vi.advanceTimersByTimeAsync(500);
      expect(scrollMouse).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
