import path from 'node:path';

const workspaceRoot = path.resolve(__dirname, '..');
const coverageDir = process.env.MIDSCENE_COVERAGE_DIR || 'coverage';

export function createCoverageConfig(projectDir: string) {
  const projectName =
    path.relative(workspaceRoot, projectDir).replace(/[\\/]/g, '__') || 'root';

  return {
    provider: 'v8' as const,
    reporter: ['text', 'json', 'json-summary', 'html'],
    reportsDirectory: path.join(workspaceRoot, coverageDir, projectName),
    all: true,
    include: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
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
