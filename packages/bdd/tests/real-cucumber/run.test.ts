/**
 * REAL-cucumber end-to-end test: spawns the actual cucumber-js CLI against
 * the fixture project in ./fixture, with a stub UI agent injected through
 * the `uiAgent` factory in the fixture's midscene.config.ts (no browser, no
 * model). The stub records every call CROSS-PROCESS by appending JSON lines
 * to the file named by BDD_STUB_LOG, which this test parses after exit.
 *
 * This layer exists because the in-process integration suite drives
 * `runStep` directly and therefore can never catch regressions in the
 * cucumber-facing glue. Specifically it pins the three live regressions:
 *
 * 1. CATCH-ALL ARITY — cucumber validates the step function's `length` per
 *    step (1 for the capture, 2 when a doc string / data table is present).
 *    The doc-string and data-table scenarios fail with "function has N
 *    arguments..." if the dynamic-length getter in register.ts breaks.
 * 2. CONFIG PATHS VS POSITIONAL — config-file `paths` SUPPRESS CLI
 *    positional args in cucumber v13. The positional-filtering test fails
 *    if defineProfile() ever emits a default `paths` again.
 * 3. DATA-TABLE ARITY (the new Critical) — same mechanism as (1) but for
 *    the dataTable argument shape; pinned by the data-table scenario.
 */
import { execSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PKG_DIR = path.resolve(__dirname, '../..');
const FIXTURE_DIR = path.resolve(__dirname, 'fixture');
const REGISTER_DIST = path.join(PKG_DIR, 'dist/lib/register.js');

const TEST_TIMEOUT_MS = 60_000;
const SPAWN_TIMEOUT_MS = 60_000;

// Same resolution as bin/midscene-bdd: @cucumber/cucumber's exports map does
// not expose ./bin/*, so resolve the package root via package.json.
const requireFromHere = createRequire(__filename);
const cucumberCli = path.join(
  path.dirname(requireFromHere.resolve('@cucumber/cucumber/package.json')),
  'bin',
  'cucumber.js',
);

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

beforeAll(() => {
  // The spawned cucumber process loads the BUILT package: defineProfile()
  // injects dist/lib/register.js, and the fixture's config / step
  // definitions resolve '@midscene/bdd' through the package self-reference
  // to dist. Plain node cannot load src/*.ts, so build when dist is missing
  // — and also when it is older than any source file, so this suite always
  // pins CURRENT behavior instead of a stale build.
  const needsBuild =
    !existsSync(REGISTER_DIST) ||
    statSync(REGISTER_DIST).mtimeMs <
      Math.max(
        ...walkFiles(path.join(PKG_DIR, 'src')).map(
          (file) => statSync(file).mtimeMs,
        ),
      );
  if (needsBuild) {
    execSync('npx rslib build', { cwd: PKG_DIR, stdio: 'pipe' });
  }
}, 180_000);

type StubRecord = [method: string, ...rest: unknown[]];

interface CucumberRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Parsed JSONL records the stub appended to BDD_STUB_LOG. */
  records: StubRecord[];
  /** Path the run's `--format message:` output was written to (if used). */
  messagesFile: string;
}

function runCucumber(
  args: string[],
  opts: { messages?: boolean } = {},
): CucumberRun {
  const dir = mkdtempSync(path.join(tmpdir(), 'midscene-bdd-real-'));
  const stubLog = path.join(dir, 'stub-calls.jsonl');
  const messagesFile = path.join(dir, 'messages.ndjson');
  const fullArgs = [...args];
  if (opts.messages) {
    fullArgs.push('--format', `message:${messagesFile}`);
  }

  const result = spawnSync(process.execPath, [cucumberCli, ...fullArgs], {
    cwd: FIXTURE_DIR,
    env: { ...process.env, BDD_STUB_LOG: stubLog },
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  const records: StubRecord[] = existsSync(stubLog)
    ? readFileSync(stubLog, 'utf-8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as StubRecord)
    : [];

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    records,
    messagesFile,
  };
}

function prompts(records: StubRecord[], method: string): string[] {
  return records
    .filter((record) => record[0] === method)
    .map((record) => String(record[1]));
}

/**
 * Assert `expected` appears as an ordered (not necessarily contiguous)
 * subsequence of `actual`. Scenario ORDER across feature files is a cucumber
 * implementation detail, but scenarios run serially in one worker, so each
 * scenario's own records keep their relative order in the global stream.
 */
function expectSubsequence(actual: string[], expected: string[]): void {
  let matched = 0;
  for (const item of actual) {
    if (matched < expected.length && item === expected[matched]) {
      matched += 1;
    }
  }
  expect(
    matched,
    `expected ordered subsequence ${JSON.stringify(expected)} in ${JSON.stringify(actual)}`,
  ).toBe(expected.length);
}

describe('real cucumber spawn', () => {
  it(
    'full run (minus @must-fail) is green and routes every scenario correctly',
    () => {
      const run = runCucumber(['--tags', 'not @must-fail'], {
        messages: true,
      });
      expect(run.status, run.stdout + run.stderr).toBe(0);

      const acts = prompts(run.records, 'aiAct');

      // Happy path: opening act, then the declaratively-invoked flow's
      // internal steps (<role> bound to "alice" from the {string} capture),
      // then the post-flow act — strictly in order within the scenario.
      expectSubsequence(acts, [
        'I open the demo shop',
        'I open the stub login page',
        'I sign in with the "alice" account',
        'I add the first item to the cart',
      ]);

      // Capture + <price> substitution: aiString returned 42.00 and the
      // later Then reached the stub with the value substituted in.
      expect(prompts(run.records, 'aiString')).toContain(
        'the first item price',
      );
      expect(prompts(run.records, 'aiAssert')).toContain(
        'the order total equals 42.00',
      );

      // ARITY PIN (doc string): before the dynamic-length catch-all this
      // run died with "function has 1 arguments, should have 2".
      const docAct = acts.find((prompt) =>
        prompt.startsWith('I paste the following note'),
      );
      expect(docAct, JSON.stringify(acts)).toBeDefined();
      expect(docAct).toContain('DOC_STRING_BODY first line');
      expect(docAct).toContain('second line');

      // ARITY PIN (data table — the new Critical): same mechanism, table
      // shape; also pins the `| a | b |` prompt rendering.
      const tableAct = acts.find((prompt) =>
        prompt.startsWith('I fill the form with'),
      );
      expect(tableAct, JSON.stringify(acts)).toBeDefined();
      expect(tableAct).toContain('| a | b |');
      expect(tableAct).toContain('| 1 | 2 |');

      // Soft: the assert reached the stub in keepRawResponse mode, returned
      // { pass: false } — and the run still exited 0 (asserted above).
      const softAssert = run.records.find(
        (record) =>
          record[0] === 'aiAssert' && String(record[1]).includes('SOFT_FAIL'),
      );
      expect(softAssert, JSON.stringify(run.records)).toBeDefined();
      expect((softAssert as StubRecord)[2]).toEqual({ keepRawResponse: true });

      // @no-ai: the classic callback ran inside the child process.
      expect(run.records).toContainEqual(['no-ai-marker', 'MARKER_42']);

      // Cleanup once per UI-touching scenario (happy, doc string, data
      // table, soft, extra) — the no-ai scenario never creates an agent.
      expect(
        run.records.filter((record) => record[0] === 'cleanup'),
      ).toHaveLength(5);

      // The After hook attaches the Midscene report path. The progress
      // format does not print attachments, so pin it via the message
      // formatter: one attachment envelope per UI-touching scenario.
      const envelopes = readFileSync(run.messagesFile, 'utf-8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as { attachment?: { body?: string } });
      const reportAttachments = envelopes.filter(
        (envelope) =>
          envelope.attachment?.body ===
          'Midscene report: /tmp/bdd-fake-report.html',
      );
      expect(reportAttachments).toHaveLength(5);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'an unmatched @no-ai step fails the run with the Implement-it snippet',
    () => {
      const run = runCucumber(['--tags', '@must-fail']);
      expect(run.status, run.stdout + run.stderr).not.toBe(0);
      const output = run.stdout + run.stderr;
      expect(output).toContain('Implement it');
      expect(output).toContain('nobody ever implemented this step');
      // The scenario's only step is @no-ai and unmatched — no agent was
      // ever created, so the stub saw nothing.
      expect(run.records).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'positional CLI paths filter to that file (profile emits no `paths`)',
    () => {
      // Pins the no-paths profile fix: config-file `paths` SUPPRESS CLI
      // positional args in cucumber v13, so this run would execute
      // main.feature too if defineProfile() regressed to emitting paths.
      const run = runCucumber(['features/extra.feature']);
      expect(run.status, run.stdout + run.stderr).toBe(0);

      expect(prompts(run.records, 'aiAct')).toEqual([
        'I do the EXTRA_ONLY thing',
      ]);
      expect(
        run.records.filter((record) => record[0] === 'cleanup'),
      ).toHaveLength(1);
      // Nothing from main.feature ran.
      expect(
        run.records.some((record) =>
          String(record[1] ?? '').includes('demo shop'),
        ),
      ).toBe(false);
      expect(run.records).not.toContainEqual(['no-ai-marker', 'MARKER_42']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '--dry-run matches every step via the catch-all (no undefined snippets)',
    () => {
      const run = runCucumber(['--dry-run']);
      expect(run.status, run.stdout + run.stderr).toBe(0);
      // Dry run executes nothing — including the @must-fail scenario, whose
      // step still MATCHES the catch-all (routing happens at run time).
      expect(run.records).toEqual([]);
      expect((run.stdout + run.stderr).toLowerCase()).not.toContain(
        'undefined',
      );
    },
    TEST_TIMEOUT_MS,
  );
});
