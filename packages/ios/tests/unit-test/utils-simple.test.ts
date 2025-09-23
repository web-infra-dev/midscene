import type { ExecException } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the exec function
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'node:child_process';
import { checkIOSEnvironment } from '../../src/utils';

const mockedExec = vi.mocked(exec);

describe('iOS Utils - Environment Checking', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkIOSEnvironment', () => {
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
        })
        .mockImplementationOnce((cmd: string, callback: any) => {
          // which curl
          if (typeof callback === 'function') {
            callback(null, { stdout: '/usr/bin/curl\n' });
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
