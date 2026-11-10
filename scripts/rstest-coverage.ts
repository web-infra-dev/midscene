import path from 'node:path';

const workspaceRoot = path.resolve(__dirname, '..');
const coverageDir = process.env.MIDSCENE_COVERAGE_DIR || 'coverage';

export function createCoverageConfig(projectDir: string) {
  const projectName =
    path.relative(workspaceRoot, projectDir).replace(/[\\/]/g, '__') || 'root';

  return {
    // Deliberately istanbul, not v8: `@rstest/coverage-v8` OOMs
    // `@midscene/computer`, which runs 13 files in a single worker at
    // `pool.maxWorkers: 1` (web-infra-dev/rstest#1524). Do not switch back.
    provider: 'istanbul' as const,
    reporters: ['text', 'json', 'json-summary', 'html'],
    reportsDirectory: path.join(workspaceRoot, coverageDir, projectName),
    include: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    // Keep this list free of whole source files. Closures handed to
    // `page.evaluate` are serialized to the browser realm, where istanbul's
    // `cov_*` counter does not exist; annotate those call sites with
    // `/* istanbul ignore next */` (see `puppeteer/base-page.ts`) instead of
    // excluding the file. Excluding all of `base-page.ts` once cost
    // `@midscene/web` ~15% coverage.
    exclude: [
      '**/*.d.ts',
      '**/*.config.*',
      '**/dist/**',
      '**/node_modules/**',
      '**/tests/**',
      '**/__tests__/**',
    ],
  };
}
