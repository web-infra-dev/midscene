import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('Chrome extension dev startup', () => {
  it('keeps the current extension release available until a complete build signals reload', async () => {
    const [packageJson, rsbuildConfig, waitForBuild] = await Promise.all([
      readFile(resolve(appRoot, 'package.json'), 'utf8'),
      readFile(resolve(appRoot, 'rsbuild.config.ts'), 'utf8'),
      readFile(resolve(appRoot, 'scripts/wait-for-build.js'), 'utf8'),
    ]);
    const { scripts } = JSON.parse(packageJson) as {
      scripts: Record<string, string>;
    };

    expect(scripts.dev).not.toContain('rimraf dist');
    expect(scripts.dev).toContain('clear-reload-signal.js');
    expect(rsbuildConfig).toContain('cleanDistPath: false');
    expect(waitForBuild).toContain('midscene-chrome-extension-reload');
    expect(waitForBuild).not.toContain("'../dist/manifest.json'");
  });
});
