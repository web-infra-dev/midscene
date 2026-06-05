import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import type { GeneratedRstestYamlProject } from './rstest-project';

export interface RunRstestYamlProjectOptions {
  project: GeneratedRstestYamlProject;
  cwd?: string;
  stdio?: 'inherit' | 'pipe';
}

// `@rstest/core` and `@rsbuild/core` are direct dependencies of `@midscene/cli`,
// so they always sit on the resolution path of the CLI's own files. Anchor the
// lookup to this module's location (`__dirname` of the bundled output) rather
// than `process.argv[1]`: the command-line entry can be a wrapper script, a
// symlinked bin, an `npx` cache path, or some other launcher whose `node_modules`
// chain does not include `@rstest/core`. Anchoring on `process.argv[1]` is what
// caused YAML runs to fail with "Cannot find module '@rstest/core/package.json'"
// in environments where the launcher differs from the install location.
const requireFromCliPackage = () => {
  if (typeof __dirname !== 'undefined') {
    return createRequire(join(__dirname, 'index.js'));
  }
  // ESM consumers of the bundled output have no `__dirname`; fall back to the
  // command-line entry so programmatic usage keeps working.
  const entry = process.argv[1]
    ? resolve(process.argv[1])
    : join(process.cwd(), 'midscene-cli.js');
  return createRequire(entry);
};

const resolvePackageFromRstestCore = (packageName: string): string => {
  const require = requireFromCliPackage();
  const rstestPackageJsonPath = require.resolve('@rstest/core/package.json');
  return createRequire(rstestPackageJsonPath).resolve(packageName);
};

export function resolveRstestCoreImportPath(): string {
  const require = requireFromCliPackage();
  const packageJsonPath = require.resolve('@rstest/core/package.json');
  return join(dirname(packageJsonPath), 'dist', 'index.js');
}

const formatRunError = (
  error: TestRunResult['unhandledErrors'][number],
): string => error.stack || `${error.name}: ${error.message}`;

export async function runRstestYamlProject(
  options: RunRstestYamlProjectOptions,
): Promise<number> {
  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(resolvePackageFromRstestCore('@rsbuild/core')).href),
  ]);
  const { project } = options;
  const maxConcurrency =
    project.maxConcurrency !== undefined
      ? Math.max(1, project.maxConcurrency)
      : undefined;
  const inlineConfig: RstestUserConfig = {
    root: project.projectDir,
    include: project.include,
    testEnvironment: 'node',
    testTimeout: project.testTimeout,
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    ...(maxConcurrency !== undefined
      ? { pool: { maxWorkers: maxConcurrency, minWorkers: maxConcurrency } }
      : {}),
    ...(project.bail !== undefined ? { bail: project.bail } : {}),
    reporters: [],
    tools: {
      rspack: (_config, { appendPlugins }) => {
        appendPlugins(
          new rspack.experiments.VirtualModulesPlugin(project.virtualModules),
        );
      },
    },
  };

  const result = await runRstest({
    cwd: options.cwd || project.projectDir,
    inlineConfig,
  });

  if (!result.ok && options.stdio !== 'pipe' && result.unhandledErrors.length) {
    console.error(
      result.unhandledErrors.map((error) => formatRunError(error)).join('\n'),
    );
  }

  return result.ok ? 0 : 1;
}
