import { exec } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

describe('circular dependency detection', () => {
  it('should not have circular dependency warnings when importing the package (CJS)', async () => {
    const packageRoot = resolve(__dirname, '../..');

    // Test CJS import with --trace-warnings to capture circular dependency warnings
    const { stdout, stderr } = await execAsync(
      `node --trace-warnings -e "require('./dist/lib/index.js')"`,
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '', // Ensure warnings are not suppressed
        },
      },
    ).catch((error) => ({
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    }));

    const output = stdout + stderr;

    // Check for circular dependency warnings
    const hasCircularDependencyWarning = output.includes('circular dependency');

    if (hasCircularDependencyWarning) {
      console.log('Detected circular dependency warnings:');
      console.log(output);
    }

    expect(hasCircularDependencyWarning).toBe(false);
  });

  it('should not warn about accessing non-existent Agent property', async () => {
    const packageRoot = resolve(__dirname, '../..');

    const { stdout, stderr } = await execAsync(
      `node --trace-warnings -e "require('./dist/lib/index.js'); console.log('done')"`,
      {
        cwd: packageRoot,
      },
    ).catch((error) => ({
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    }));

    const output = stdout + stderr;

    const hasAgentWarning =
      output.includes("Accessing non-existent property 'Agent'") ||
      output.includes("Accessing non-existent property 'createAgent'");

    if (hasAgentWarning) {
      console.log('Detected Agent/createAgent circular dependency warnings:');
      console.log(output);
    }

    expect(hasAgentWarning).toBe(false);
  });

  it('should properly export all public APIs', async () => {
    // This test verifies that all expected exports are available
    const { PlaywrightAgent, PuppeteerAgent, PageAgent, StaticPageAgent } =
      await import('@midscene/web');

    expect(PlaywrightAgent).toBeDefined();
    expect(PuppeteerAgent).toBeDefined();
    expect(PageAgent).toBeDefined();
    expect(StaticPageAgent).toBeDefined();
  });
});
