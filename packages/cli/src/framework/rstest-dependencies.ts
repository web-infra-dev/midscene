import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

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

export const resolvePackageFromRstestCore = (packageName: string): string => {
  const require = requireFromCliPackage();
  const rstestPackageJsonPath = require.resolve('@rstest/core/package.json');
  return createRequire(rstestPackageJsonPath).resolve(packageName);
};

export function resolveRstestCoreImportPath(): string {
  const require = requireFromCliPackage();
  const packageJsonPath = require.resolve('@rstest/core/package.json');
  return join(dirname(packageJsonPath), 'dist', 'index.js');
}
