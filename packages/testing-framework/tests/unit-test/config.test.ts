import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defineMidsceneConfig,
  loadMidsceneConfig,
  validateMidsceneConfig,
} from '../../src/config';
import type { MidsceneFrameworkConfig } from '../../src/types';

const tempProject = (configBody: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'midscene-framework-config-'));
  writeFileSync(join(dir, 'midscene.config.ts'), configBody);
  return dir;
};

describe('defineMidsceneConfig', () => {
  it('returns the config unchanged', () => {
    const config: MidsceneFrameworkConfig = {
      testDir: './e2e',
      include: ['**/*.yaml'],
    };
    expect(defineMidsceneConfig(config)).toBe(config);
  });
});

describe('loadMidsceneConfig', () => {
  it('loads a default-exported config from a directory', async () => {
    const dir = tempProject(
      `export default {\n  testDir: './e2e',\n  include: ['**/*.yaml'],\n  testRunner: { maxConcurrency: 2 },\n};\n`,
    );
    const loaded = await loadMidsceneConfig(join(dir, 'midscene.config.ts'));
    expect(loaded.root).toBe(dir);
    expect(loaded.config.testDir).toBe('./e2e');
    expect(loaded.config.testRunner?.maxConcurrency).toBe(2);
  });

  it('throws when the config file is missing', async () => {
    await expect(
      loadMidsceneConfig(join(tmpdir(), 'definitely-missing.config.ts')),
    ).rejects.toThrow(/not found/);
  });
});

describe('validateMidsceneConfig', () => {
  it('requires testDir', () => {
    expect(() => validateMidsceneConfig({ include: ['**/*.yaml'] })).toThrow(
      /testDir/,
    );
  });

  it('requires a non-empty include', () => {
    expect(() => validateMidsceneConfig({ testDir: './e2e' })).toThrow(
      /include/,
    );
    expect(() =>
      validateMidsceneConfig({ testDir: './e2e', include: [] }),
    ).toThrow(/include/);
  });

  it('rejects target and setup together', () => {
    expect(() =>
      validateMidsceneConfig({
        testDir: './e2e',
        include: ['**/*.yaml'],
        target: { type: 'web', options: { url: 'http://x' } },
        setup: async () => ({ agent: { runYaml: async () => undefined } }),
      }),
    ).toThrow(/both "target" and "setup"/);
  });

  it('rejects custom steps that override built-in steps', () => {
    expect(() =>
      validateMidsceneConfig({
        testDir: './e2e',
        include: ['**/*.yaml'],
        yamlSteps: { aiAct: async () => undefined },
      }),
    ).toThrow(/cannot override built-in steps: aiAct/);
  });

  it('accepts a valid config', () => {
    expect(() =>
      validateMidsceneConfig({
        testDir: './e2e',
        include: ['**/*.yaml'],
        yamlSteps: { seedOrder: async () => undefined },
      }),
    ).not.toThrow();
  });
});
