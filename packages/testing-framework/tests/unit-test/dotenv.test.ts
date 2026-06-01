import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadFrameworkDotenv, resolveDotenvCandidates } from '../../src/dotenv';

const tempDir = (prefix: string): string =>
  mkdtempSync(join(tmpdir(), `midscene-framework-dotenv-${prefix}-`));

describe('resolveDotenvCandidates', () => {
  it('returns dedicated paths for cwd and config dir by default', () => {
    const cwd = '/tmp/project';
    const configDir = '/tmp/project/sub';
    expect(resolveDotenvCandidates({ cwd, configDir })).toEqual([
      resolve(cwd, '.env'),
      resolve(configDir, '.env'),
    ]);
  });

  it('deduplicates when cwd equals configDir', () => {
    const cwd = '/tmp/project';
    const configDir = '/tmp/project';
    expect(resolveDotenvCandidates({ cwd, configDir })).toEqual([
      resolve(cwd, '.env'),
    ]);
  });

  it('honours envConfig.path overrides relative to cwd', () => {
    const cwd = '/tmp/project';
    const configDir = '/tmp/project/sub';
    expect(
      resolveDotenvCandidates({
        cwd,
        configDir,
        envConfig: { path: ['./shared.env', '/abs/.env'] },
      }),
    ).toEqual([resolve(cwd, './shared.env'), '/abs/.env']);
  });
});

describe('loadFrameworkDotenv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    Reflect.deleteProperty(process.env, 'MIDSCENE_TEST_FRAMEWORK_DOTENV');
    Reflect.deleteProperty(process.env, 'MIDSCENE_TEST_FRAMEWORK_OVERRIDE');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads existing files and skips missing ones', () => {
    const cwd = tempDir('cwd');
    const configDir = tempDir('cfg');
    writeFileSync(
      join(configDir, '.env'),
      'MIDSCENE_TEST_FRAMEWORK_DOTENV=loaded-from-config\n',
    );

    const result = loadFrameworkDotenv({ cwd, configDir });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ path: join(cwd, '.env'), loaded: false });
    expect(result[1]).toEqual({ path: join(configDir, '.env'), loaded: true });
    expect(process.env.MIDSCENE_TEST_FRAMEWORK_DOTENV).toBe(
      'loaded-from-config',
    );
  });

  it('preserves existing process.env values when override is not set', () => {
    const cwd = tempDir('cwd-preserve');
    writeFileSync(
      join(cwd, '.env'),
      'MIDSCENE_TEST_FRAMEWORK_OVERRIDE=from-file\n',
    );
    process.env.MIDSCENE_TEST_FRAMEWORK_OVERRIDE = 'shell-wins';

    loadFrameworkDotenv({ cwd, configDir: cwd });

    expect(process.env.MIDSCENE_TEST_FRAMEWORK_OVERRIDE).toBe('shell-wins');
  });

  it('overrides existing process.env values when env.override is true', () => {
    const cwd = tempDir('cwd-override');
    writeFileSync(
      join(cwd, '.env'),
      'MIDSCENE_TEST_FRAMEWORK_OVERRIDE=from-file\n',
    );
    process.env.MIDSCENE_TEST_FRAMEWORK_OVERRIDE = 'shell-wins';

    loadFrameworkDotenv({
      cwd,
      configDir: cwd,
      envConfig: { override: true },
    });

    expect(process.env.MIDSCENE_TEST_FRAMEWORK_OVERRIDE).toBe('from-file');
  });

  it('returns nothing when env.enabled is false', () => {
    const cwd = tempDir('cwd-disabled');
    writeFileSync(
      join(cwd, '.env'),
      'MIDSCENE_TEST_FRAMEWORK_DOTENV=should-not-load\n',
    );

    const result = loadFrameworkDotenv({
      cwd,
      configDir: cwd,
      envConfig: { enabled: false },
    });

    expect(result).toEqual([]);
    expect(process.env.MIDSCENE_TEST_FRAMEWORK_DOTENV).toBeUndefined();
  });
});
