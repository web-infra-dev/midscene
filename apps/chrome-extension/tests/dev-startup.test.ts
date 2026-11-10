import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@rstest/core';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('Chrome extension dev startup', () => {
  it('cleans stale output and waits for the essential extension files to stabilize', async () => {
    const [packageJson, rsbuildConfig, waitForBuild, webExtConfig] =
      await Promise.all([
        readFile(resolve(appRoot, 'package.json'), 'utf8'),
        readFile(resolve(appRoot, 'rsbuild.config.ts'), 'utf8'),
        readFile(resolve(appRoot, 'scripts/wait-for-build.js'), 'utf8'),
        readFile(resolve(appRoot, 'web-ext-config.cjs'), 'utf8'),
      ]);
    const { scripts } = JSON.parse(packageJson) as {
      scripts: Record<string, string>;
    };

    expect(scripts.dev).toContain('rimraf dist');
    expect(scripts.dev).not.toContain('clear-reload-signal.js');
    expect(rsbuildConfig).not.toContain('cleanDistPath: false');
    expect(waitForBuild).toContain("'../dist/manifest.json'");
    expect(waitForBuild).toContain('stabilityWait');
    expect(webExtConfig).not.toContain('watchFile:');
  });
});
