import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

it.each([
  'missing config',
  'conflicting configs',
  'missing input',
  'config load failure',
])('restores terminal streams after %s', async (failure) => {
  const root = mkdtempSync(join(tmpdir(), 'test-cli-cleanup-'));
  const tty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  const write = vi.fn(() => true);
  try {
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.stubEnv('CI', '');
    const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    process.stdout.write = write;
    process.stderr.write = write;
    let args: string[] = [];
    if (failure === 'missing config') args = ['--config', 'missing.config.ts'];
    if (failure === 'conflicting configs') {
      writeFileSync(join(root, 'midscene.config.ts'), 'export default {};');
      writeFileSync(join(root, 'midscene.config.mjs'), 'export default {};');
    }
    if (failure === 'missing input') args = ['missing.yaml'];
    if (failure === 'config load failure')
      writeFileSync(
        join(root, 'midscene.config.mjs'),
        'throw new Error("controlled load failure");',
      );
    const { runTestCli } = await import('../src/cli/test-command');
    expect(await runTestCli(args)).toBe(1);
    expect(errorOutput).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    expect(process.stdout.write).toBe(write);
    expect(process.stderr.write).toBe(write);
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
    if (tty) Object.defineProperty(process.stdout, 'isTTY', tty);
    else Reflect.deleteProperty(process.stdout, 'isTTY');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
