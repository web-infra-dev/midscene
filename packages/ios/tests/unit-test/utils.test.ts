import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the exec and execFile functions
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

// Mock the os module for platform testing
vi.mock('node:os', () => ({
  platform: vi.fn(),
}));

import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { checkIOSEnvironment, checkMacOSPlatform } from '../../src/utils';

const mockedExec = vi.mocked(exec);
const mockedPlatform = vi.mocked(platform);

describe('iOS Utils - Environment Checking', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkMacOSPlatform', () => {
    it('should return true for macOS platform', () => {
      mockedPlatform.mockReturnValue('darwin');

      const result = checkMacOSPlatform();

      expect(result.isMacOS).toBe(true);
      expect(result.platform).toBe('darwin');
    });

    it('should return false for Windows platform', () => {
      mockedPlatform.mockReturnValue('win32');

      const result = checkMacOSPlatform();

      expect(result.isMacOS).toBe(false);
      expect(result.platform).toBe('win32');
    });

    it('should return false for Linux platform', () => {
      mockedPlatform.mockReturnValue('linux');

      const result = checkMacOSPlatform();

      expect(result.isMacOS).toBe(false);
      expect(result.platform).toBe('linux');
    });
  });

  describe('checkIOSEnvironment', () => {
    it('should return available false when not running on macOS', async () => {
      mockedPlatform.mockReturnValue('win32');

      const result = await checkIOSEnvironment();

      expect(result.available).toBe(false);
      expect(result.error).toContain(
        'iOS development is only supported on macOS',
      );
      expect(result.error).toContain('win32');
    });

    it('should return available false when running on Linux', async () => {
      mockedPlatform.mockReturnValue('linux');

      const result = await checkIOSEnvironment();

      expect(result.available).toBe(false);
      expect(result.error).toContain(
        'iOS development is only supported on macOS',
      );
      expect(result.error).toContain('linux');
    });

    describe('checkIOSEnvironment on macOS', () => {
      beforeEach(() => {
        // Mock macOS platform for all tests in this group
        mockedPlatform.mockReturnValue('darwin');
      });
      it('should return available true when all tools are present', async () => {
        // Mock successful command executions
        mockedExec
          .mockImplementationOnce((cmd: string, callback: any) => {
            // which xcrun
            if (typeof callback === 'function') {
              callback(null, { stdout: '/usr/bin/xcrun\n' });
            }
            return {} as any;
          })
          .mockImplementationOnce((cmd: string, callback: any) => {
            // xcrun simctl help
            if (typeof callback === 'function') {
              callback(null, { stdout: 'simctl help output' });
            }
            return {} as any;
          })
          .mockImplementationOnce((cmd: string, callback: any) => {
            // xcodebuild -version
            if (typeof callback === 'function') {
              callback(null, { stdout: 'Xcode 15.0' });
            }
            return {} as any;
          });

        const result = await checkIOSEnvironment();
        expect(result.available).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should return available false when xcrun is missing', async () => {
        mockedExec.mockImplementationOnce((cmd: string, callback: any) => {
          // which xcrun - not found
          if (typeof callback === 'function') {
            callback(null, { stdout: '' });
          }
          return {} as any;
        });

        const result = await checkIOSEnvironment();
        expect(result.available).toBe(false);
        expect(result.error).toContain('xcrun not found');
      });

      it('should return available false when xcodebuild is missing', async () => {
        mockedExec
          .mockImplementationOnce((cmd: string, callback: any) => {
            // which xcrun - found
            if (typeof callback === 'function') {
              callback(null, { stdout: '/usr/bin/xcrun\n' });
            }
            return {} as any;
          })
          .mockImplementationOnce((cmd: string, callback: any) => {
            // xcrun simctl help - success
            if (typeof callback === 'function') {
              callback(null, { stdout: 'simctl help output' });
            }
            return {} as any;
          })
          .mockImplementationOnce((cmd: string, callback: any) => {
            // xcodebuild -version - fails
            if (typeof callback === 'function') {
              callback(new Error('xcodebuild not found'), null);
            }
            return {} as any;
          });

        const result = await checkIOSEnvironment();
        expect(result.available).toBe(false);
        expect(result.error).toContain('xcodebuild not found');
      });

      it('should handle simctl not available error', async () => {
        mockedExec
          .mockImplementationOnce((cmd: string, callback: any) => {
            // which xcrun
            if (typeof callback === 'function') {
              callback(null, { stdout: '/usr/bin/xcrun\n' });
            }
            return {} as any;
          })
          .mockImplementationOnce((cmd: string, callback: any) => {
            // xcrun simctl help - fails with simctl error
            if (typeof callback === 'function') {
              callback(new Error('unable to find utility "simctl"'), null);
            }
            return {} as any;
          });

        const result = await checkIOSEnvironment();
        expect(result.available).toBe(false);
        expect(result.error).toContain('iOS Simulator (simctl) not available');
      });
    });
  });
});
