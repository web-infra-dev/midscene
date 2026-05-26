import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { glob } from 'glob';
import { createJiti } from 'jiti';
import type {
  FrameworkTestFile,
  LoadedMidsceneConfig,
  MidsceneFrameworkConfig,
} from './types';

export function defineMidsceneConfig<T extends MidsceneFrameworkConfig>(
  config: T,
): T {
  return config;
}

export async function loadMidsceneConfig(
  configPath = resolve(process.cwd(), 'midscene.config.ts'),
): Promise<LoadedMidsceneConfig> {
  const resolvedPath = resolve(configPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`midscene.config.ts not found: ${resolvedPath}`);
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

  return {
    path: resolvedPath,
    root: dirname(resolvedPath),
    config,
  };
}

const toPosixPath = (value: string): string => value.split('\\').join('/');

const uniqueSorted = (files: string[]): string[] =>
  Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));

const inferFileType = (filePath: string): FrameworkTestFile['type'] => {
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return 'yaml';
  }
  return 'test';
};

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
