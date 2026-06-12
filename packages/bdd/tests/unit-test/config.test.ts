import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineBddConfig, loadBddConfig } from '../../src/config';
import type { BddConfig, UiTarget } from '../../src/types';

const tmpDirs: string[] = [];
const originalEnvConfig = process.env.MIDSCENE_BDD_CONFIG;

function makeTmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'midscene-bdd-config-'));
  tmpDirs.push(dir);
  return dir;
}

function writeConfig(
  dir: string,
  contents: string,
  name = 'midscene.config.ts',
): string {
  const file = path.join(dir, name);
  writeFileSync(file, contents);
  return file;
}

beforeEach(() => {
  Reflect.deleteProperty(process.env, 'MIDSCENE_BDD_CONFIG');
});

afterEach(() => {
  if (originalEnvConfig === undefined) {
    Reflect.deleteProperty(process.env, 'MIDSCENE_BDD_CONFIG');
  } else {
    process.env.MIDSCENE_BDD_CONFIG = originalEnvConfig;
  }
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadBddConfig', () => {
  it('applies defaults for a minimal web config', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default { uiAgent: { type: 'web', url: 'https://example.com' } };\n`,
    );

    const resolved = await loadBddConfig({ cwd: dir });

    expect(resolved.uiAgent).toEqual({
      type: 'web',
      url: 'https://example.com',
    });
    expect(resolved.generalAgent).toEqual({});
    expect(resolved.paths).toEqual({
      features: ['features/**/*.feature'],
      skills: 'features/skills',
    });
    expect(resolved.baseDir).toBe(dir);
    expect(path.isAbsolute(resolved.baseDir)).toBe(true);
  });

  it('keeps explicit values', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default {
        uiAgent: { type: 'web', url: 'https://example.com', headed: true },
        generalAgent: { modelEnv: { MIDSCENE_MODEL_BASE_URL: 'codex://app-server' } },
        paths: { features: ['e2e/**/*.feature'], skills: 'e2e/skills' },
      };\n`,
    );

    const resolved = await loadBddConfig({ cwd: dir });

    expect(resolved.uiAgent).toEqual({
      type: 'web',
      url: 'https://example.com',
      headed: true,
    });
    expect(resolved.generalAgent).toEqual({
      modelEnv: { MIDSCENE_MODEL_BASE_URL: 'codex://app-server' },
    });
    expect(resolved.paths).toEqual({
      features: ['e2e/**/*.feature'],
      skills: 'e2e/skills',
    });
  });

  it('throws a helpful error when the config file is missing', async () => {
    const dir = makeTmpDir();
    const expectedPath = path.join(dir, 'midscene.config.ts');

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      `[midscene-bdd] No midscene.config.ts found at ${expectedPath}. Create one with defineBddConfig({ uiAgent: { type: 'web', url: '...' } }).`,
    );
  });

  it('throws when uiAgent is missing', async () => {
    const dir = makeTmpDir();
    writeConfig(dir, 'export default { paths: {} };\n');

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      /\[midscene-bdd\] midscene\.config\.ts: uiAgent is required/,
    );
  });

  it('throws on an unknown uiAgent.type, naming the type and listing valid ones', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default { uiAgent: { type: 'desktop', url: 'x' } };\n`,
    );

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      /uiAgent\.type 'desktop' is unknown — valid types: web, android, ios, harmony, computer, interface/,
    );
  });

  it('accepts an android target with deviceId and launch', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default { uiAgent: { type: 'android', deviceId: 'emulator-5554', launch: 'com.example.app' } };\n`,
    );

    const resolved = await loadBddConfig({ cwd: dir });

    expect(resolved.uiAgent).toEqual({
      type: 'android',
      deviceId: 'emulator-5554',
      launch: 'com.example.app',
    });
  });

  it('accepts ios, harmony, computer and interface targets', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default { uiAgent: { type: 'interface', module: './my-device.ts', export: 'MyDevice', param: { token: 'x' } } };\n`,
    );

    const resolved = await loadBddConfig({ cwd: dir });
    expect(resolved.uiAgent).toMatchObject({
      type: 'interface',
      module: './my-device.ts',
    });

    // Typed as UiTarget[] so the compiler keeps these fixtures valid as the
    // union evolves.
    const targets: UiTarget[] = [
      { type: 'ios', launch: 'com.example.app' },
      { type: 'harmony', deviceId: 'dev-1' },
      { type: 'computer', displayId: '1' },
    ];
    for (const target of targets) {
      expect(() => defineBddConfig({ uiAgent: target })).not.toThrow();
    }
  });

  it('throws when an interface target has no module', async () => {
    const dir = makeTmpDir();
    writeConfig(dir, `export default { uiAgent: { type: 'interface' } };\n`);

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      /uiAgent\.module must be a non-empty module specifier when type is 'interface'/,
    );
  });

  it('validates uiAgent.scope', () => {
    // Ill-typed on purpose: exercises runtime validation of JS configs.
    expect(() =>
      defineBddConfig({
        uiAgent: { type: 'android', scope: 'global' },
      } as unknown as BddConfig),
    ).toThrow(/uiAgent\.scope must be 'scenario' or 'worker', got 'global'/);

    expect(() =>
      defineBddConfig({
        uiAgent: { type: 'android', scope: 'worker' },
      }),
    ).not.toThrow();
  });

  it('passes uiAgentOptions through to the resolved config', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default {
        uiAgent: { type: 'web', url: 'https://example.com' },
        uiAgentOptions: { generateReport: false, groupName: 'Checkout' },
      };\n`,
    );

    const resolved = await loadBddConfig({ cwd: dir });
    expect(resolved.uiAgentOptions).toEqual({
      generateReport: false,
      groupName: 'Checkout',
    });
  });

  it('rejects a non-object uiAgentOptions', () => {
    expect(() =>
      defineBddConfig({
        uiAgent: { type: 'web', url: 'https://example.com' },
        uiAgentOptions: 'verbose',
      } as never),
    ).toThrow(/uiAgentOptions must be an object .*got string/);

    expect(() =>
      defineBddConfig({
        uiAgent: { type: 'web', url: 'https://example.com' },
        uiAgentOptions: ['generateReport'],
      } as never),
    ).toThrow(/uiAgentOptions must be an object .*got an array/);
  });

  it('throws when uiAgent.url is empty', async () => {
    const dir = makeTmpDir();
    writeConfig(dir, `export default { uiAgent: { type: 'web', url: '' } };\n`);

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      /\[midscene-bdd\] midscene\.config\.ts: uiAgent\.url must be a non-empty string/,
    );
  });

  it('accepts a factory-function uiAgent', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      'export default { uiAgent: async () => ({ agent: {} }) };\n',
    );

    const resolved = await loadBddConfig({ cwd: dir });

    expect(typeof resolved.uiAgent).toBe('function');
  });

  it('throws when paths.features is an empty array', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default { uiAgent: { type: 'web', url: 'https://example.com' }, paths: { features: [] } };\n`,
    );

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      /\[midscene-bdd\] midscene\.config\.ts: paths\.features must be a non-empty array/,
    );
  });

  it('throws when paths.skills is not a string', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `export default { uiAgent: { type: 'web', url: 'https://example.com' }, paths: { skills: 42 } };\n`,
    );

    await expect(loadBddConfig({ cwd: dir })).rejects.toThrow(
      /\[midscene-bdd\] midscene\.config\.ts: paths\.skills must be a string/,
    );
  });

  it('honors the MIDSCENE_BDD_CONFIG env override', async () => {
    const cwdDir = makeTmpDir();
    const configDir = makeTmpDir();
    const configFile = writeConfig(
      configDir,
      `export default { uiAgent: { type: 'web', url: 'https://from-env.example.com' } };\n`,
      'custom.config.ts',
    );
    process.env.MIDSCENE_BDD_CONFIG = configFile;

    const resolved = await loadBddConfig({ cwd: cwdDir });

    expect(resolved.uiAgent).toEqual({
      type: 'web',
      url: 'https://from-env.example.com',
    });
    expect(resolved.baseDir).toBe(configDir);
  });

  it('prefers an explicit configPath over the env override', async () => {
    const dir = makeTmpDir();
    const explicitFile = writeConfig(
      dir,
      `export default { uiAgent: { type: 'web', url: 'https://explicit.example.com' } };\n`,
      'explicit.config.ts',
    );
    process.env.MIDSCENE_BDD_CONFIG = path.join(dir, 'does-not-exist.ts');

    const resolved = await loadBddConfig({ configPath: explicitFile });

    expect(resolved.uiAgent).toEqual({
      type: 'web',
      url: 'https://explicit.example.com',
    });
  });

  it('loads CJS-style module.exports configs', async () => {
    const dir = makeTmpDir();
    writeConfig(
      dir,
      `module.exports = { uiAgent: { type: 'web', url: 'https://cjs.example.com' } };\n`,
    );

    const resolved = await loadBddConfig({ cwd: dir });

    expect(resolved.uiAgent).toEqual({
      type: 'web',
      url: 'https://cjs.example.com',
    });
  });
});

describe('defineBddConfig', () => {
  it('returns the config unchanged when valid', () => {
    const config = {
      uiAgent: { type: 'web' as const, url: 'https://example.com' },
    };

    expect(defineBddConfig(config)).toBe(config);
  });

  it('throws eagerly on invalid config', () => {
    expect(() => defineBddConfig({ uiAgent: undefined } as never)).toThrow(
      /\[midscene-bdd\] midscene\.config\.ts: uiAgent is required/,
    );

    expect(() =>
      defineBddConfig({
        uiAgent: { type: 'desktop', url: 'x' },
      } as never),
    ).toThrow(/uiAgent\.type 'desktop' is unknown/);
  });
});
