/**
 * Real-Rstest smoke: runs the actual Rstest orchestrator (worker spawn, virtual
 * module bundling, in-worker config load, per-case result write-back) with a
 * mocked browser (fake UI Agent) and mocked model (mock general agent). No
 * network, no Chrome. Proves the wiring end-to-end, complementing the unit
 * tests that inject a fake runner.
 *
 * Usage: node tests/smoke/rstest-real.mjs   (run from the package dir)
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, '../..');
const distEntry = join(pkgDir, 'dist', 'lib', 'rstest-entry.js');

if (!existsSync(distEntry)) {
  console.error('Build first: npx nx build testing-framework');
  process.exit(2);
}

const { createRstestProject, runRstestProject } = await import(
  join(pkgDir, 'dist', 'es', 'index.mjs')
);

const work = join(pkgDir, 'midscene_run', 'smoke-rstest');
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'e2e'), { recursive: true });

writeFileSync(
  join(work, 'midscene.config.ts'),
  `export default {
  uiAgent: async () => ({
    agent: {
      aiAct: async () => undefined,
      aiAsk: async () => 'recorded the requested values',
      interface: { screenshotBase64: async () => 'data:image/png;base64,AAAA' },
      reportFile: undefined,
    },
  }),
  testDir: './e2e',
  generalAgent: {
    run: async (input) =>
      input.kind === 'agent'
        ? { text: 'mock analysis' }
        : { text: 'verified', verdict: { pass: true, reason: 'mock pass' } },
  },
};
`,
);

writeFileSync(
  join(work, 'e2e', 'case.yaml'),
  'name: smoke\nflow:\n  - ui: do something\n  - verify: it worked\n  - agent: look around\n',
);

const configPath = join(work, 'midscene.config.ts');
const project = createRstestProject({
  configPath,
  files: [join(work, 'e2e', 'case.yaml')],
  projectDir: work,
  outputDir: join(work, 'runner'),
  frameworkImport: distEntry,
  maxConcurrency: 1,
});

const exitCode = await runRstestProject({
  project,
  cwd: work,
  stdio: 'inherit',
});

const resultFile = project.cases[0].resultFile;
const ok = existsSync(resultFile);
const result = ok ? JSON.parse(readFileSync(resultFile, 'utf-8')) : undefined;

console.log('\n[smoke] rstest exitCode:', exitCode);
console.log('[smoke] result status:', result?.status);
console.log(
  '[smoke] steps:',
  result?.steps?.map((s) => `${s.node}:${s.status}`).join(', '),
);

const pass =
  exitCode === 0 && result?.status === 'passed' && result.steps.length === 3;
rmSync(work, { recursive: true, force: true });

if (!pass) {
  console.error('[smoke] FAILED');
  process.exit(1);
}
console.log('[smoke] PASSED');
