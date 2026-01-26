import { getBasicEnvValue } from 'src/env/basic';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_RUN_DIR,
  MIDSCENE_USE_DEVICE_TIME,
  getCurrentTime,
  type DeviceWithTime,
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
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return system time when MIDSCENE_USE_DEVICE_TIME is not set', async () => {
    const before = Date.now();
    const result = await getCurrentTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return system time when MIDSCENE_USE_DEVICE_TIME is false', async () => {
    vi.stubEnv(MIDSCENE_USE_DEVICE_TIME, 'false');

    const before = Date.now();
    const result = await getCurrentTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return system time when device is not provided', async () => {
    vi.stubEnv(MIDSCENE_USE_DEVICE_TIME, 'true');

    const before = Date.now();
    const result = await getCurrentTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return system time when device does not have getDeviceTime method', async () => {
    vi.stubEnv(MIDSCENE_USE_DEVICE_TIME, 'true');

    const deviceWithoutTime: DeviceWithTime = {};

    const before = Date.now();
    const result = await getCurrentTime(deviceWithoutTime);
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return device time when MIDSCENE_USE_DEVICE_TIME is true and device has getDeviceTime', async () => {
    vi.stubEnv(MIDSCENE_USE_DEVICE_TIME, 'true');

    const mockDeviceTime = 1700000000000;
    const deviceWithTime: DeviceWithTime = {
      getDeviceTime: vi.fn().mockResolvedValue(mockDeviceTime),
    };

    const result = await getCurrentTime(deviceWithTime);

    expect(result).toBe(mockDeviceTime);
    expect(deviceWithTime.getDeviceTime).toHaveBeenCalledOnce();
  });

  it('should fall back to system time when getDeviceTime throws an error', async () => {
    vi.stubEnv(MIDSCENE_USE_DEVICE_TIME, 'true');

    const deviceWithError: DeviceWithTime = {
      getDeviceTime: vi.fn().mockRejectedValue(new Error('Device error')),
    };

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const before = Date.now();
    const result = await getCurrentTime(deviceWithError);
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get device time'),
    );

    consoleSpy.mockRestore();
  });
});
