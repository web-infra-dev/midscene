import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRunReportDump } from '@midscene/core';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const oldCli = resolve(here, '../../cli/bin/midscene');
const cliAcceptanceTimeout = 30_000;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(failCleanup = false) {
  const root = mkdtempSync(join(tmpdir(), 'legacy-cli-entry-'));
  roots.push(root);
  copyFileSync(
    join(here, 'fixtures/legacy-interface.cjs'),
    join(root, 'legacy-interface.cjs'),
  );
  const file = join(root, 'old.yaml');
  writeFileSync(
    file,
    `interface:
  module: ./legacy-interface.cjs
  param:
    cleanupFile: ${JSON.stringify(join(root, 'closed.txt'))}
    failCleanup: ${failCleanup}
agent:
  reportFileName: compatibility
config:
  output: ./legacy-output.json
tasks:
  - name: old task
    flow:
      - javascript: unchanged code
        name: answer
      - recordToReport: unchanged snapshot
`,
  );
  return {
    root,
    file,
    env: {
      ...process.env,
      MIDSCENE_RUN_DIR: join(root, 'midscene_run'),
      MIDSCENE_MODEL_NAME: 'test',
      MIDSCENE_MODEL_API_KEY: 'test',
      MIDSCENE_REPORT_QUIET: '1',
    },
  };
}

describe('published YAML entry acceptance', () => {
  it.each(['file', 'files', 'config'] as const)(
    'keeps the old CLI %s syntax and standard reports through real Rstest workers',
    (entry) => {
      const { root, file, env } = fixture();
      const summaryPath = join(root, 'summary.json');
      const second = join(root, 'second.yml');
      writeFileSync(
        second,
        readFileSync(file, 'utf8')
          .replace('compatibility\n', 'compatibility-second\n')
          .replace('legacy-output.json', 'second-output.json'),
      );
      writeFileSync(
        join(root, 'batch.yaml'),
        'files: [old.yaml, second.yml]\nconcurrent: 1\n',
      );
      const args =
        entry === 'file'
          ? [file]
          : entry === 'files'
            ? ['--files', file, second]
            : ['--config', join(root, 'batch.yaml')];
      execFileSync(
        process.execPath,
        [oldCli, ...args, '--concurrent', '1', '--summary', summaryPath],
        { cwd: root, env, timeout: 20000, stdio: 'pipe' },
      );
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      expect(summary.summary).toMatchObject({
        total: entry === 'file' ? 1 : 2,
        failed: 0,
        notExecuted: 0,
      });
      for (const result of summary.results) {
        expect(result.success).toBe(true);
        expect(
          JSON.parse(readFileSync(resolve(root, result.output), 'utf8')),
        ).toEqual({ answer: { echoed: 'unchanged code' } });
        expect(readFileSync(resolve(root, result.report), 'utf8')).toContain(
          'midscene_test_run_dump',
        );
      }
      expect(existsSync(join(root, 'midscene.config.ts'))).toBe(false);
    },
    cliAcceptanceTimeout,
  );

  it.each([false, true])(
    'preserves whole-file retry, setup ordering and retry reports (batch setup: %s)',
    (withSetup) => {
      const { root, file, env } = fixture();
      const summaryPath = join(root, 'summary.json');
      const log = join(root, 'actions.txt');
      const script = readFileSync(file, 'utf8').replace(
        '    failCleanup: false',
        `    failCleanup: false\n    actionLog: ${JSON.stringify(log)}\n    failureMarker: ${JSON.stringify(join(root, 'failed-once'))}`,
      );
      writeFileSync(
        file,
        script.replace(
          '      - recordToReport:',
          '      - javascript: fail once\n      - recordToReport:',
        ),
      );
      const setup = join(root, 'setup.yaml');
      writeFileSync(
        setup,
        script
          .replace('unchanged code', 'setup code')
          .replace('compatibility\n', 'setup-report\n'),
      );
      execFileSync(
        process.execPath,
        [
          oldCli,
          file,
          '--retry',
          '1',
          '--concurrent',
          '1',
          '--summary',
          summaryPath,
          ...(withSetup ? ['--setup', setup] : []),
        ],
        { cwd: root, env, timeout: 20000, stdio: 'pipe' },
      );
      expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
        ...(withSetup ? ['setup code'] : []),
        'unchanged code',
        'fail once',
        'unchanged code',
        'fail once',
      ]);
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      const result = summary.results.find(
        (item: { script: string }) => resolve(root, item.script) === file,
      );
      expect(result.success).toBe(true);
      expect(
        result.attempts.map((item: { success: boolean }) => item.success),
      ).toEqual([false, true]);
      expect(result.attempts[0].report).not.toBe(result.attempts[1].report);
      const report = readFileSync(resolve(root, result.retryReport), 'utf8');
      expect(report).toContain('midscene_test_run_dump');
      expect(report).toContain('fixture action failed once');
    },
    cliAcceptanceTimeout,
  );

  it(
    'loads the existing .env without overriding shell values',
    () => {
      const { root, file, env } = fixture();
      writeFileSync(
        join(root, '.env'),
        'LEGACY_ACCEPTANCE_FILE=from-dotenv\nLEGACY_ACCEPTANCE_SHELL=not-shell\n',
      );
      writeFileSync(
        file,
        readFileSync(file, 'utf8')
          .replace('compatibility\n', '${LEGACY_ACCEPTANCE_FILE}\n')
          .replace(
            'unchanged code',
            '${LEGACY_ACCEPTANCE_FILE}/${LEGACY_ACCEPTANCE_SHELL}',
          ),
      );
      const childEnv: NodeJS.ProcessEnv = {
        ...env,
        LEGACY_ACCEPTANCE_SHELL: 'from-shell',
      };
      Reflect.deleteProperty(childEnv, 'LEGACY_ACCEPTANCE_FILE');
      execFileSync(process.execPath, [oldCli, file], {
        cwd: root,
        env: childEnv,
        timeout: 20000,
        stdio: 'pipe',
      });
      expect(
        JSON.parse(readFileSync(join(root, 'legacy-output.json'), 'utf8'))
          .answer,
      ).toEqual({ echoed: 'from-dotenv/from-shell' });
    },
    cliAcceptanceTimeout,
  );

  it('runs unchanged YAML through the legacy command and generates the new report', () => {
    const { root, file, env } = fixture();
    const summaryPath = join(root, 'summary.json');
    execFileSync(process.execPath, [oldCli, file, '--summary', summaryPath], {
      cwd: root,
      env,
      timeout: 20000,
      stdio: 'pipe',
    });
    expect(readFileSync(join(root, 'closed.txt'), 'utf8')).toBe('closed');
    expect(
      JSON.parse(readFileSync(join(root, 'legacy-output.json'), 'utf8')).answer,
    ).toEqual({ echoed: 'unchanged code' });
    expect(existsSync(join(root, 'midscene.config.ts'))).toBe(false);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary.summary).toMatchObject({ total: 1, failed: 0 });
    const report = readFileSync(
      resolve(root, summary.results[0].report),
      'utf8',
    );
    expect(report).toContain('midscene_test_run_dump');
    expect(report).toContain('old task');
    const scriptElements = [
      ...report.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
    ];
    const runnerScript = scriptElements.find((match) =>
      /(?:^|\s)type="midscene_test_run_dump"/.test(match[1]),
    )![2];
    const dump = JSON.parse(
      antiEscapeScriptTag(runnerScript),
    ) as TestRunReportDump;
    const step = dump.projects[0].documents[0].cases[0].attempts[0].steps.find(
      (item) => item.node === 'recordToReport',
    )!;
    expect(step.agentDetails).toHaveLength(1);
    expect(step.agentDetailDiagnostic).toBeUndefined();
    const [detail] = step.agentDetails!;
    const agentScripts = scriptElements.filter((match) =>
      /(?:^|\s)type="midscene_web_dump"/.test(match[1]),
    );
    const source = agentScripts.find((item) => {
      const encodedReportId =
        /(?:^|\s)(?:data-report-id|data-group-id)="([^"]*)"/.exec(item[1])?.[1];
      return (
        encodedReportId !== undefined &&
        decodeURIComponent(encodedReportId) === detail.reportId
      );
    });
    expect(source).toBeDefined();
    const agentDump = JSON.parse(antiEscapeScriptTag(source![2]));
    expect(agentDump.executions).toContainEqual(
      expect.objectContaining({ id: detail.executionId }),
    );
    expect(report).toContain('midscene_screenshot_ref');
  });

  it('rejects native Test files before creating platform resources', () => {
    const { root, env } = fixture();
    const native = join(root, 'native.yaml');
    writeFileSync(
      native,
      'cases:\n  - name: native\n    steps:\n      - aiAct: run\n',
    );

    let failure: unknown;
    try {
      execFileSync(process.execPath, [oldCli, native], {
        cwd: root,
        env,
        timeout: 20000,
        stdio: 'pipe',
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ status: 1 });
    const stderr = String((failure as { stderr?: Buffer }).stderr);
    expect(stderr).toContain('midscene only runs legacy tasks/flow YAML');
    expect(stderr).toContain('midscene-test');
    expect(existsSync(join(root, 'closed.txt'))).toBe(false);
  });

  it('keeps the old framework API and default report standard without a new config', () => {
    const { root, file, env } = fixture();
    const framework = require.resolve('@midscene/cli/framework');
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `require(${JSON.stringify(framework)}).runYamlCase({file:${JSON.stringify(file)}}).then(result => console.log('RESULT:'+JSON.stringify(result))).catch(error => { console.error(error); process.exitCode=1; });`,
      ],
      { cwd: root, env, timeout: 20000, stdio: 'pipe' },
    ).toString();
    const result = JSON.parse(output.split('RESULT:')[1].trim());
    expect(readFileSync(join(root, 'closed.txt'), 'utf8')).toBe('closed');
    expect(result.file).toBe(file);
    expect(readFileSync(result.report, 'utf8')).toContain(
      'midscene_test_run_dump',
    );
  });

  it(
    'reports async interface cleanup failure as a failed legacy CLI run',
    () => {
      const { root, file, env } = fixture(true);
      const summaryPath = join(root, 'summary.json');
      let failure: unknown;
      try {
        execFileSync(
          process.execPath,
          [oldCli, file, '--summary', summaryPath],
          {
            cwd: root,
            env,
            timeout: 20000,
            stdio: 'pipe',
          },
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ status: 1 });
      expect(readFileSync(join(root, 'closed.txt'), 'utf8')).toBe('closed');
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      expect(summary.summary.failed).toBe(1);
      expect(
        readFileSync(resolve(root, summary.results[0].report), 'utf8'),
      ).toContain('fixture cleanup failed');
    },
    cliAcceptanceTimeout,
  );
});
