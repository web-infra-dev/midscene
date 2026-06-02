import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { glob } from 'glob';
import { createJiti } from 'jiti';
import { BUILTIN_YAML_STEP_NAMES } from './builtin-steps';
import type {
  FrameworkTestFile,
  LoadedMidsceneConfig,
  MidsceneFrameworkConfig,
} from './types';

/**
 * Type-only helper. It returns the config unchanged so the runtime stays
 * explicit and the project keeps full control over its own configuration.
 */
export function defineMidsceneConfig<T extends MidsceneFrameworkConfig>(
  config: T,
): T {
  return config;
}

const DEFAULT_CONFIG_BASENAMES = [
  'midscene.config.ts',
  'midscene.config.mts',
  'midscene.config.cts',
  'midscene.config.js',
  'midscene.config.mjs',
  'midscene.config.cjs',
];

const resolveConfigPath = (configPath?: string): string => {
  if (configPath) {
    return resolve(configPath);
  }

  const cwd = process.cwd();
  const matched = DEFAULT_CONFIG_BASENAMES.map((name) =>
    resolve(cwd, name),
  ).find((candidate) => existsSync(candidate));

  return matched || resolve(cwd, 'midscene.config.ts');
};

export async function loadMidsceneConfig(
  configPath?: string,
): Promise<LoadedMidsceneConfig> {
  const resolvedPath = resolveConfigPath(configPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`midscene config not found: ${resolvedPath}`);
  }

  const jiti = createJiti(resolvedPath, {
    moduleCache: false,
  });
  const config = await jiti.import<MidsceneFrameworkConfig | undefined>(
    resolvedPath,
    {
      default: true,
    },
  );
  if (!config || typeof config !== 'object') {
    throw new Error(
      `midscene config must export a default object: ${resolvedPath}`,
    );
  }

  validateMidsceneConfig(config, resolvedPath);

  return {
    path: resolvedPath,
    root: dirname(resolvedPath),
    config,
  };
}

/**
 * Validate the documented invariants of a `midscene.config.ts`:
 * - `testDir` and `include` are required.
 * - `target` and `setup` cannot be defined together (two runtime targets).
 * - custom `yamlSteps` must not override built-in step names.
 */
export function validateMidsceneConfig(
  config: MidsceneFrameworkConfig,
  source = 'midscene.config.ts',
): void {
  if (!config.testDir) {
    throw new Error(`${source} must define "testDir"`);
  }

  if (!Array.isArray(config.include) || config.include.length === 0) {
    throw new Error(`${source} must define a non-empty "include" array`);
  }

  if (config.target && config.setup) {
    throw new Error(
      `${source} cannot define both "target" and "setup"; pick one runtime target definition`,
    );
  }

  if (config.yamlSteps) {
    const overridden = Object.keys(config.yamlSteps).filter((name) =>
      BUILTIN_YAML_STEP_NAMES.has(name),
    );
    if (overridden.length > 0) {
      throw new Error(
        `${source} custom yamlSteps cannot override built-in steps: ${overridden.join(', ')}`,
      );
    }
  }
}

const toPosixPath = (value: string): string => value.split('\\').join('/');

const uniqueSorted = (files: string[]): string[] =>
  Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));

const inferFileType = (filePath: string): FrameworkTestFile['type'] =>
  filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? 'yaml' : 'test';

export async function collectFrameworkTestFiles(input: {
  root: string;
  config: MidsceneFrameworkConfig;
}): Promise<FrameworkTestFile[]> {
  const testDir = input.config.testDir || './e2e';
  const include =
    input.config.include && input.config.include.length > 0
      ? input.config.include
      : ['**/*.yaml', '**/*.yml', '**/*.test.ts'];
  const exclude = input.config.exclude || [];
  const cwd = resolve(input.root, testDir);

  const files: string[] = [];
  for (const pattern of include) {
    const matched = await glob(pattern, {
      cwd,
      absolute: true,
      ignore: exclude,
      nodir: true,
      dot: true,
    });
    files.push(...matched);
  }

  return uniqueSorted(files).map((filePath) => {
    const relativeToRoot = toPosixPath(
      filePath.startsWith(input.root)
        ? filePath.slice(input.root.length + 1)
        : filePath,
    );
    return {
      filePath,
      relativePath: relativeToRoot,
      type: inferFileType(filePath),
    };
  });
}
