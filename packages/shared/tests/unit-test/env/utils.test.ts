import { getBasicEnvValue } from 'src/env/basic';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_RUN_DIR,
  getCurrentTime,
  type DeviceWithTimestamp,
} from '../../../src/env';

describe('getBasicEnvValue', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('should return the value of the given env key', () => {
    vi.stubEnv(MIDSCENE_RUN_DIR, '<test-run-dir>');
    expect(getBasicEnvValue(MIDSCENE_RUN_DIR)).toBe('<test-run-dir>');
  });

  it('should throw if key is not in BASIC_ENV_KEYS', () => {
    expect(() =>
      // @ts-expect-error NOT_EXIST_KEY will cause ts err
      getBasicEnvValue('NOT_EXIST_KEY'),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getBasicEnvValue with key NOT_EXIST_KEY is not supported.]',
    );
  });
});

describe('getCurrentTime', () => {
  it('should return system time when useDeviceTimestamp is not set', async () => {
    const before = Date.now();
    const result = await getCurrentTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return system time when useDeviceTimestamp is false', async () => {
    const before = Date.now();
    const result = await getCurrentTime(undefined, false);
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return system time when device is not provided', async () => {
    const before = Date.now();
    const result = await getCurrentTime(undefined, true);
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return system time when device does not have getTimestamp method', async () => {
    const deviceWithoutTime: DeviceWithTimestamp = {};

    const before = Date.now();
    const result = await getCurrentTime(deviceWithoutTime, true);
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return device time when useDeviceTimestamp is true and device has getTimestamp', async () => {
    const mockDeviceTime = 1700000000000;
    const deviceWithTime: DeviceWithTimestamp = {
      getTimestamp: vi.fn().mockResolvedValue(mockDeviceTime),
    };

    const result = await getCurrentTime(deviceWithTime, true);

    expect(result).toBe(mockDeviceTime);
    expect(deviceWithTime.getTimestamp).toHaveBeenCalledOnce();
  });

  it('should fall back to system time when getTimestamp throws an error', async () => {
    const deviceWithError: DeviceWithTimestamp = {
      getTimestamp: vi.fn().mockRejectedValue(new Error('Device error')),
    };

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const before = Date.now();
    const result = await getCurrentTime(deviceWithError, true);
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get device time'),
    );

    consoleSpy.mockRestore();
  });
});
