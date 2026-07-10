import path from 'node:path';

const workspaceRoot = path.resolve(__dirname, '..');
const coverageDir = process.env.MIDSCENE_COVERAGE_DIR || 'coverage';

export function createCoverageConfig(projectDir: string) {
  const projectName =
    path.relative(workspaceRoot, projectDir).replace(/[\\/]/g, '__') || 'root';

  return {
    provider: 'istanbul' as const,
    reporters: ['text', 'json', 'json-summary', 'html'],
    reportsDirectory: path.join(workspaceRoot, coverageDir, projectName),
    include: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    exclude: [
      '**/*.d.ts',
      '**/*.config.*',
      '**/dist/**',
      '**/node_modules/**',
      '**/tests/**',
      '**/__tests__/**',
      // Do not instrument files that hand closures to `page.evaluate`. The
      // istanbul provider rewrites those closures to reference a module-scoped
      // `cov_*` counter; Puppeteer/Playwright serialize the closure and run it
      // in the browser realm where `cov_*` is undefined, throwing
      // "ReferenceError: cov_… is not defined". See RSTEST-MIGRATION-WORKAROUNDS.md.
      '**/puppeteer/base-page.ts',
    ],
  };
}
