import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { collectFrameworkTestFiles, loadMidsceneConfig } from './config';
import {
  createCaseTestSource,
  createPackageJsonSource,
  createRstestConfigSource,
} from './runtime/source';
import { DEFAULT_FRAMEWORK_VERSION } from './version';

export interface EmitRstestProjectOptions {
  /** Path to the source `midscene.config.ts`. Defaults to the one in `cwd`. */
  configPath?: string;
  /** Directory the native Rstest project is written to. */
  outDir: string;
  /** Version range to pin `@midscene/testing-framework` to in `package.json`. */
  frameworkVersion?: string;
  /** Version range to pin `@rstest/core` to in `package.json`. */
  rstestVersion?: string;
}

export interface EmitRstestProjectResult {
  outDir: string;
  configFile: string;
  rstestConfigFile: string;
  packageJsonFile: string;
  /** Generated `e2e/*.test.ts` files. */
  caseFiles: string[];
  /** Copied YAML case files. */
  yamlFiles: string[];
  /** Copied user-authored `.test.ts` files. */
  userTestFiles: string[];
}

const toPosix = (value: string): string => value.split(sep).join('/');

const toRelativeImport = (from: string, toPath: string): string => {
  const rel = toPosix(relative(from, toPath));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const stripExt = (value: string): string => value.replace(/\.[^./]+$/, '');

/**
 * Mode B entry: read a `midscene.config.ts` project and write a self-contained
 * native Rstest project (one `e2e/*.test.ts` per YAML case + a thin
 * `rstest.config.ts` + `package.json`) to `outDir`. The emitted project is run
 * with the native `rstest` command, not this runner.
 */
export async function emitRstestProject(
  options: EmitRstestProjectOptions,
): Promise<EmitRstestProjectResult> {
  const loaded = await loadMidsceneConfig(options.configPath);
  const files = await collectFrameworkTestFiles({
    root: loaded.root,
    config: loaded.config,
  });

  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });

  // Copy the user's config verbatim; emitted tests import it relatively.
  const configFile = join(outDir, basename(loaded.path));
  copyFileSync(loaded.path, configFile);
  const configImportBase = stripExt(configFile);

  const yamlFiles: string[] = [];
  const caseFiles: string[] = [];
  const userTestFiles: string[] = [];

  for (const file of files) {
    const destPath = join(outDir, file.relativePath);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(file.filePath, destPath);

    if (file.type === 'test') {
      userTestFiles.push(destPath);
      continue;
    }

    yamlFiles.push(destPath);
    const testFile = join(
      dirname(destPath),
      `${stripExt(basename(destPath))}.test.ts`,
    );
    const testDir = dirname(testFile);
    const source = createCaseTestSource({
      configImport: toRelativeImport(testDir, configImportBase),
      yamlFileExpr: `resolve(__dirname, ${JSON.stringify(basename(destPath))})`,
      projectDirExpr: `resolve(__dirname, ${JSON.stringify(toPosix(relative(testDir, outDir)) || '.')})`,
      testName: file.relativePath,
    });
    writeFileSync(testFile, source);
    caseFiles.push(testFile);
  }

  const rstestConfigFile = join(outDir, 'rstest.config.ts');
  writeFileSync(
    rstestConfigFile,
    createRstestConfigSource({
      include: ['e2e/**/*.test.ts'],
      testRunner: loaded.config.testRunner,
    }),
  );

  const packageJsonFile = join(outDir, 'package.json');
  writeFileSync(
    packageJsonFile,
    createPackageJsonSource({
      name: basename(outDir),
      frameworkVersion: options.frameworkVersion ?? DEFAULT_FRAMEWORK_VERSION,
      rstestVersion: options.rstestVersion,
    }),
  );

  return {
    outDir,
    configFile,
    rstestConfigFile,
    packageJsonFile,
    caseFiles,
    yamlFiles,
    userTestFiles,
  };
}
