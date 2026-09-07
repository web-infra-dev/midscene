import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);
const packageRoot = resolve(__dirname, '../..');
const cliPath = join(packageRoot, 'bin', 'midscene-test');

interface FailedExecution {
  code: number;
  stdout: string;
  stderr: string;
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  const fixtures = join(__dirname, 'fixtures');
  for (const entry of readdirSync(fixtures, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rmSync(join(fixtures, entry.name, 'midscene_run'), {
        recursive: true,
        force: true,
      });
    }
  }
});

const jsonFilesBelow = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.json')) files.push(path);
    }
  };
  visit(directory);
  return files;
};

const runDirFor = (resultDir: string): string => {
  const runIds = readdirSync(resultDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && /^\d{14}-[0-9a-f]{8}$/.test(entry.name),
    )
    .map((entry) => entry.name);
  if (runIds.length !== 1) {
    throw new Error(
      `Expected one run directory in ${resultDir}, found ${runIds.length}.`,
    );
  }
  return join(resultDir, runIds[0]);
};

const summaryPathFor = (resultDir: string) =>
  join(runDirFor(resultDir), 'summary.json');

const documentResultFiles = (runDir: string): string[] =>
  jsonFilesBelow(runDir).filter((path) => basename(path) === 'document.json');

const attemptResultFiles = (runDir: string): string[] =>
  jsonFilesBelow(runDir).filter(
    (path) =>
      relative(runDir, path).split(sep).includes('documents') &&
      basename(path) !== 'document.json',
  );

const temporaryRun = (prefix: string) => {
  const temporary = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(temporary);
  return {
    resultDir: join(temporary, 'results'),
    executionLog: join(temporary, 'executed.log'),
  };
};

const runFailure = async (
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<FailedExecution> => {
  try {
    await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: packageRoot,
      env,
    });
  } catch (error) {
    return error as FailedExecution;
  }
  throw new Error('Expected test CLI to fail.');
};

describe('midscene-test CLI', () => {
  it('publishes only the midscene-test bin', () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    );

    expect(packageJson.bin).toEqual({
      'midscene-test': './bin/midscene-test',
    });
    expect(existsSync(join(packageRoot, 'bin', 'midscene-workflow'))).toBe(
      false,
    );
  });

  it('runs all workflow documents serially and writes native project results', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'test-project');
    const { resultDir, executionLog } = temporaryRun('midscene-test-e2e-');

    const execution = await execFileAsync(
      process.execPath,
      [cliPath, projectRoot, '--result-dir', resultDir],
      {
        cwd: packageRoot,
        env: { ...process.env, WORKFLOW_E2E_LOG: executionLog },
      },
    );

    expect(execution.stdout).toContain(
      'midscene-test: preflighted 1 projects, 2 documents, 3 cases, 0 collection errors',
    );
    expect(execution.stdout).toContain('[document 1/2] flows/first.yaml');
    expect(execution.stdout).toContain('    [case 1/2] first case');
    expect(execution.stdout).toContain('      → step 1/2: test.record');
    expect(execution.stdout).toMatch(
      / {6}✓ step 1\/2: test\.record \(\d+ ms\)/,
    );
    expect(execution.stdout).toContain('3/3 cases passed, 0 failed, 0 not run');
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'first:one',
      'first:two',
      'second:one',
      'nested:one',
      'nested:two',
    ]);
    const runDir = runDirFor(resultDir);
    expect(attemptResultFiles(runDir)).toHaveLength(3);
    expect(documentResultFiles(runDir)).toHaveLength(2);
    expect(existsSync(summaryPathFor(resultDir))).toBe(true);
    expect(execution.stdout).toContain(`Summary: ${summaryPathFor(resultDir)}`);
    expect(existsSync(join(resultDir, 'project.json'))).toBe(false);
    expect(existsSync(join(resultDir, 'manifest.json'))).toBe(false);
    expect(existsSync(join(resultDir, 'rstest-tests'))).toBe(false);

    const projectResult = JSON.parse(
      readFileSync(summaryPathFor(resultDir), 'utf8'),
    );
    expect(projectResult).toMatchObject({
      schemaVersion: 3,
      runId: basename(runDir),
      factsRoot: '.',
      status: 'success',
      exitCode: 0,
      summary: {
        total: 3,
        passed: 3,
        failed: 0,
        notRun: 0,
        collectionErrors: 0,
        documentFailures: 0,
      },
      projects: [
        {
          projectId: 'project-0',
          name: 'web',
          platform: 'web',
          cases: [
            { status: 'success', attempts: [{ attemptIndex: 0 }] },
            { status: 'success', attempts: [{ attemptIndex: 0 }] },
            { status: 'success', attempts: [{ attemptIndex: 0 }] },
          ],
        },
      ],
    });
  });

  it('describes registered nodes without reading workflows or running setup', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'node-reference-project');

    const execution = await execFileAsync(
      process.execPath,
      [cliPath, 'describe-nodes', projectRoot],
      { cwd: packageRoot },
    );

    expect(execution.stderr).toBe('');
    expect(execution.stdout).toContain(
      '<!-- Generated by `midscene-test describe-nodes`.',
    );
    expect(execution.stdout).toContain('## `order.create`');
    expect(execution.stdout).toContain('**Title:** Create order');
    expect(execution.stdout).toContain('"quantity"');
    expect(execution.stdout).toContain('"required"');
    expect(execution.stdout.endsWith('\n')).toBe(true);
    expect(execution.stdout.endsWith('\n\n')).toBe(false);
    expect(existsSync(join(projectRoot, '.midscene'))).toBe(false);
  });

  it('shares one Project Agent with lifecycle nodes in the CLI process', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'midscene-context-project');
    const { resultDir, executionLog } = temporaryRun('midscene-context-e2e-');

    const execution = await execFileAsync(
      process.execPath,
      [cliPath, projectRoot, '--result-dir', resultDir],
      {
        cwd: packageRoot,
        env: { ...process.env, WORKFLOW_E2E_LOG: executionLog },
      },
    );

    expect(execution.stdout).toContain('1/1 cases passed');
    const lines = readFileSync(executionLog, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(9);
    const pid = lines[0].split(':')[1];
    expect(lines[0]).toBe(`config:${pid}`);
    expect(lines[1]).toBe(`projectSetup:1:${pid}`);
    expect(lines[2]).toBe(`beforeAll:1:${pid}`);
    expect(lines[3]).toMatch(new RegExp(`^beforeEach:1:1:.+:${pid}$`));
    expect(lines.slice(4)).toEqual([
      `record:1:1:Attempt started:Shared document Agent:${pid}`,
      `record:1:1:Ready:Agent came from Project setup:${pid}`,
      `record:1:1:Attempt finished:Shared document Agent:${pid}`,
      `afterAll:1:${pid}`,
      `projectTeardown:1:1:${pid}`,
    ]);

    const [runResultPath] = attemptResultFiles(runDirFor(resultDir));
    const runResult = JSON.parse(readFileSync(runResultPath, 'utf8'));
    expect(runResult.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(runResult).not.toHaveProperty('runId');
    expect(runResult).toMatchObject({
      status: 'success',
      beforeEach: [
        { node: 'attempt.start', phase: 'beforeEach' },
        { node: 'recordToReport', phase: 'beforeEach' },
      ],
      steps: [
        {
          node: 'recordToReport',
          phase: 'steps',
          output: { summary: 'Recorded to report: Ready' },
        },
      ],
      afterEach: [{ node: 'recordToReport', phase: 'afterEach' }],
    });
  });

  it('continues later cases and documents after a case fails', async () => {
    const projectRoot = join(
      __dirname,
      'fixtures',
      'failure-continuation-project',
    );
    const { resultDir, executionLog } = temporaryRun('midscene-failure-e2e-');

    const failure = await runFailure([projectRoot, '--result-dir', resultDir], {
      ...process.env,
      WORKFLOW_E2E_LOG: executionLog,
    });

    expect(failure.code).toBe(1);
    expect(failure.stdout).toContain('    → step 1/1: test.record');
    expect(failure.stdout).toMatch(
      / {6}✗ step 1\/1: test\.record \(\d+ ms\) — Node "test\.record" failed: controlled case failure/,
    );
    expect(failure.stdout).toContain('2/3 cases passed, 1 failed, 0 not run');
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'first:failed',
      'second:passed',
      'third:passed',
    ]);
    const projectResult = JSON.parse(
      readFileSync(summaryPathFor(resultDir), 'utf8'),
    );
    expect(
      projectResult.projects[0].cases.map(
        (caseResult: { status: string }) => caseResult.status,
      ),
    ).toEqual(['failed', 'success', 'success']);
  });

  it('runs afterAll and Node teardown after beforeAll fails', async () => {
    const projectRoot = join(
      __dirname,
      'fixtures',
      'before-all-failure-project',
    );
    const { resultDir, executionLog } = temporaryRun(
      'midscene-before-all-e2e-',
    );

    const failure = await runFailure([projectRoot, '--result-dir', resultDir], {
      ...process.env,
      WORKFLOW_E2E_LOG: executionLog,
    });

    expect(failure.code).toBe(1);
    expect(failure.stdout).toContain('0/1 cases passed, 0 failed, 1 not run');
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'beforeAll',
      'afterAll',
      'documentNodeTeardown',
    ]);
    const runDir = runDirFor(resultDir);
    expect(attemptResultFiles(runDir)).toHaveLength(0);
    const [documentResultPath] = documentResultFiles(runDir);
    const documentResult = JSON.parse(readFileSync(documentResultPath, 'utf8'));
    expect(documentResult.status).toBe('failed');
    expect(documentResult.beforeAll[0].error.message).toContain(
      'controlled beforeAll failure',
    );
    expect(documentResult.afterAll[0].status).toBe('success');
    const projectResult = JSON.parse(
      readFileSync(summaryPathFor(resultDir), 'utf8'),
    );
    expect(projectResult.projects[0].cases).toEqual([
      expect.objectContaining({
        status: 'not-run',
        notRunReason: 'document-start-failed',
      }),
    ]);
  });

  it('rejects scheduling options that are not supported as CLI flags', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'test-project');
    for (const option of [
      '--parallel',
      '--max-concurrency',
      '--retry',
      '--bail',
    ]) {
      const failure = await runFailure([projectRoot, option]);
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain(`Unknown option: ${option}`);
    }
  });

  it('finishes the active document and marks remaining cases interrupted', async () => {
    const projectRoot = join(__dirname, 'fixtures', 'interrupt-project');
    const { resultDir, executionLog } = temporaryRun('midscene-interrupt-e2e-');

    const failure = await runFailure([projectRoot, '--result-dir', resultDir], {
      ...process.env,
      WORKFLOW_E2E_LOG: executionLog,
    });

    expect(failure.code).toBe(1);
    expect(readFileSync(executionLog, 'utf8').trim().split('\n')).toEqual([
      'setup:default',
      'interrupt',
      'teardown:default',
    ]);
    const projectResult = JSON.parse(
      readFileSync(summaryPathFor(resultDir), 'utf8'),
    );
    expect(projectResult.projects[0].cases).toEqual([
      expect.objectContaining({ name: 'active case', status: 'success' }),
      expect.objectContaining({
        name: 'skipped case',
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
      expect.objectContaining({
        name: 'skipped document case',
        status: 'not-run',
        notRunReason: 'interrupted',
      }),
    ]);
    expect(projectResult.projects[0].documents).toHaveLength(1);
  });
});
