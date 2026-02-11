import { existsSync, readFileSync } from 'node:fs';
import { resolveTargetProfile } from '@/target-config';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('target-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveTargetProfile', () => {
    test('should throw when no config file is found', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => resolveTargetProfile('staging')).toThrow(
        /No config file found/,
      );
    });

    test('should throw when target name is not found', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('midscene.config.yaml');
      });
      vi.mocked(readFileSync).mockReturnValue(
        'targets:\n  production:\n    platform: web\n    url: "https://prod.example.com"\n',
      );

      expect(() => resolveTargetProfile('staging')).toThrow(
        /Target "staging" not found/,
      );
    });

    test('should resolve a valid target profile', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('midscene.config.yaml');
      });
      vi.mocked(readFileSync).mockReturnValue(
        'targets:\n  staging:\n    platform: web\n    url: "https://staging.example.com"\n    bridge: true\n',
      );

      const profile = resolveTargetProfile('staging');
      expect(profile).toEqual({
        platform: 'web',
        url: 'https://staging.example.com',
        bridge: true,
      });
    });

    test('should resolve a target with device config', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('midscene.config.yaml');
      });
      vi.mocked(readFileSync).mockReturnValue(
        'targets:\n  my-android:\n    platform: android\n    device: "emulator-5554"\n',
      );

      const profile = resolveTargetProfile('my-android');
      expect(profile).toEqual({
        platform: 'android',
        device: 'emulator-5554',
      });
    });

    test('should resolve a target with display config', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('midscene.config.yaml');
      });
      vi.mocked(readFileSync).mockReturnValue(
        'targets:\n  desktop:\n    platform: computer\n    display: "1"\n',
      );

      const profile = resolveTargetProfile('desktop');
      expect(profile).toEqual({
        platform: 'computer',
        display: '1',
      });
    });

    test('should list available targets in error message', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('midscene.config.yaml');
      });
      vi.mocked(readFileSync).mockReturnValue(
        'targets:\n  prod:\n    platform: web\n  staging:\n    platform: web\n',
      );

      expect(() => resolveTargetProfile('dev')).toThrow(
        /Available targets: prod, staging/,
      );
    });
  });
});
