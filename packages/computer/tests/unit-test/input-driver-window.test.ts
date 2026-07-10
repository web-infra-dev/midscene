import { describe, expect, it, vi } from 'vitest';
import { ComputerInputDriver, type LibNut } from '../../src/input-driver';

function createDriver(libnut: Partial<LibNut>) {
  const debug = vi.fn();
  const driver = new ComputerInputDriver({
    getLibnut: () => libnut as LibNut,
    useAppleScript: () => false,
    sendKeyViaAppleScript: vi.fn(),
    runPhasedScroll: vi.fn(() => false),
    debug,
  });
  return { driver, debug };
}

describe('ComputerInputDriver active window handle', () => {
  it('returns a valid libnut window handle', () => {
    const { driver } = createDriver({
      getActiveWindow: vi.fn(() => 42),
    });

    expect(driver.getActiveWindowHandle()).toBe(42);
  });

  it('returns null when libnut does not expose a usable handle', () => {
    expect(createDriver({}).driver.getActiveWindowHandle()).toBeNull();
    expect(
      createDriver({
        getActiveWindow: vi.fn(() => 0),
      }).driver.getActiveWindowHandle(),
    ).toBeNull();
    expect(
      createDriver({
        getActiveWindow: vi.fn(() => Number.POSITIVE_INFINITY),
      }).driver.getActiveWindowHandle(),
    ).toBeNull();
  });

  it('logs provider errors and returns null', () => {
    const { driver, debug } = createDriver({
      getActiveWindow: vi.fn(() => {
        throw new Error('window provider failed');
      }),
    });

    expect(driver.getActiveWindowHandle()).toBeNull();
    expect(debug).toHaveBeenCalledWith(
      'getActiveWindowHandle failed: Error: window provider failed',
    );
  });
});
