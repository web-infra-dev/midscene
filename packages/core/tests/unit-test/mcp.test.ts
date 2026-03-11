import { runSkillCLI } from '@/mcp/index';
import { describe, expect, it } from 'vitest';

describe('runSkillCLI', () => {
  it('should be a function', () => {
    expect(typeof runSkillCLI).toBe('function');
  });

  it('should show help and exit when called with --help', async () => {
    const mockDevice = class {
      interfaceType = 'mock';
      async screenshotBase64() {
        return 'data:image/png;base64,abc';
      }
      async size() {
        return { width: 1920, height: 1080 };
      }
      actionSpace() {
        return [];
      }
    };

    const originalArgv = process.argv;
    process.argv = ['node', 'test', '--help'];

    await runSkillCLI({
      DeviceClass: mockDevice as any,
      scriptName: 'test-device',
    });

    process.argv = originalArgv;
  });
});
