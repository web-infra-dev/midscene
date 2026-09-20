import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@rstest/core';
import { generateDumpScriptTag } from '../../src/dump';
import { TestRunReportAssembler } from '../../src/report';
import type {
  TestRunReportDump,
  TestRunReportSourceIndex,
} from '../../src/test-run-report';
import { type AIUsageInfo, ReportActionDump } from '../../src/types';
import { getVersion } from '../../src/utils';

const temporaryDirectories: string[] = [];

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'midscene-test-report-'));
  temporaryDirectories.push(directory);
  return directory;
};

const runnerDump = (index: TestRunReportSourceIndex): TestRunReportDump => ({
  schemaVersion: 1,
  kind: 'test-runner',
  runId: 'run-1',
  status: 'success',
  startedAt: '2026-08-20T00:00:00.000Z',
  endedAt: '2026-08-20T00:00:01.000Z',
  durationMs: 1_000,
  summary: {
    total: 1,
    passed: 1,
    failed: 0,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  },
  metrics: index.metrics,
  projects: [],
});

const writeAgentReport = (
  filePath: string,
  executionIds: string[],
  mode: 'inline' | 'directory' = 'inline',
  withUsage = false,
): void => {
  mkdirSync(join(filePath, '..'), { recursive: true });
  const dump = new ReportActionDump({
    sdkVersion: getVersion(),
    groupName: 'agent',
    modelBriefs: [],
    executions: executionIds.map((id) => ({
      id,
      logTime: 1,
      name: id,
      tasks: withUsage
        ? [
            {
              taskId: `task-${id}`,
              type: 'Log',
              status: 'finished',
              executor: async () => {},
              usage: {
                model_name: 'fixture',
                prompt_tokens: 5,
                completion_tokens: 2,
                total_tokens: 7,
                time_cost: 10,
              } as AIUsageInfo,
            },
          ]
        : [],
    })),
  });
  const script = generateDumpScriptTag(dump.serialize(), {
    'data-group-id': 'source',
    'data-screenshot-mode': mode,
  });
  writeFileSync(filePath, `<html>${script}</html>`);
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('TestRunReportAssembler', () => {
  it('builds a custom-only standalone report', () => {
    const outputDir = temporaryDirectory();
    const reportPath = new TestRunReportAssembler().assemble({
      outputDir,
      reportFileName: 'custom-only',
      sources: [],
      buildRunnerDump: runnerDump,
    });

    expect(reportPath).toBe(join(outputDir, 'custom-only.html'));
    const html = readFileSync(reportPath, 'utf8');
    expect(html).toContain('type="midscene_test_run_dump"');
    expect(
      html.match(/<script type="midscene_web_dump"[^>]*data-group-id/g),
    ).toBeNull();
  });

  it('indexes Agent executions and emits independent report attributes', () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'source.html');
    writeAgentReport(sourcePath, ['execution-a', 'execution-b']);
    let receivedIndex: TestRunReportSourceIndex | undefined;

    const reportPath = new TestRunReportAssembler().assemble({
      outputDir: join(root, 'output'),
      reportFileName: 'run',
      sources: [{ scopeId: 'attempt-1', sourcePath }],
      buildRunnerDump(index) {
        receivedIndex = index;
        return runnerDump(index);
      },
    });

    expect(receivedIndex?.sources).toEqual([
      expect.objectContaining({
        reportId: 'runner-report-1',
        scopeId: 'attempt-1',
        executionIds: ['execution-a', 'execution-b'],
      }),
    ]);
    const html = readFileSync(reportPath, 'utf8');
    expect(html).toContain('data-report-id="runner-report-1"');
    expect(html).toContain('data-runner-scope-id="attempt-1"');
    expect(html).toContain('execution-a');
  });

  it('indexes a shared Agent source under multiple scopes and emits it once', () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'shared.html');
    writeAgentReport(sourcePath, ['execution-a', 'execution-b']);
    let receivedIndex: TestRunReportSourceIndex | undefined;
    const reportPath = new TestRunReportAssembler().assemble({
      outputDir: join(root, 'output'),
      reportFileName: 'shared',
      sources: [
        { scopeId: 'attempt-1', sourcePath },
        { scopeId: 'attempt-2', sourcePath },
      ],
      buildRunnerDump(index) {
        receivedIndex = index;
        return runnerDump(index);
      },
    });
    expect(receivedIndex?.sources.map(({ scopeId }) => scopeId)).toEqual([
      'attempt-1',
      'attempt-2',
    ]);
    expect(
      new Set(receivedIndex?.sources.map(({ reportId }) => reportId)).size,
    ).toBe(1);
    const html = readFileSync(reportPath, 'utf8');
    expect(
      html.match(/<script type="midscene_web_dump"[^>]*data-group-id/g),
    ).toHaveLength(1);
  });

  it('counts stable executions once across native reports and legacy snapshots', () => {
    const root = temporaryDirectory();
    const shared = join(root, 'shared.html');
    const snapshot = join(root, 'legacy-snapshot.html');
    writeAgentReport(
      shared,
      ['native-first', 'legacy', 'native-last'],
      'inline',
      true,
    );
    writeAgentReport(snapshot, ['native-first', 'legacy'], 'inline', true);
    let receivedIndex: TestRunReportSourceIndex | undefined;
    new TestRunReportAssembler().assemble({
      outputDir: join(root, 'output'),
      reportFileName: 'mixed',
      sources: [
        { scopeId: 'native-first', sourcePath: shared },
        { scopeId: 'legacy', sourcePath: snapshot },
        { scopeId: 'native-last', sourcePath: shared },
      ],
      buildRunnerDump(index) {
        receivedIndex = index;
        return runnerDump(index);
      },
    });
    expect(receivedIndex?.metrics).toEqual({
      modelCallCount: 3,
      modelTimeMs: 30,
      promptTokens: 15,
      cachedInputTokens: 0,
      completionTokens: 6,
      totalTokens: 21,
    });
  });

  it('uses directory mode and rejects ambiguous executions in one scope', () => {
    const root = temporaryDirectory();
    const directoryReport = join(root, 'directory-source', 'index.html');
    writeAgentReport(directoryReport, ['directory-execution'], 'directory');
    const screenshotDir = join(root, 'directory-source', 'screenshots');
    mkdirSync(screenshotDir);
    writeFileSync(join(screenshotDir, 'image.png'), 'image');

    const outputDir = join(root, 'output');
    const reportPath = new TestRunReportAssembler().assemble({
      outputDir,
      reportFileName: 'directory-run',
      sources: [{ scopeId: 'attempt-1', sourcePath: directoryReport }],
      buildRunnerDump: runnerDump,
    });
    expect(reportPath).toBe(join(outputDir, 'directory-run', 'index.html'));
    expect(
      existsSync(join(outputDir, 'directory-run', 'screenshots', 'image.png')),
    ).toBe(true);

    const first = join(root, 'first.html');
    const second = join(root, 'second.html');
    writeAgentReport(first, ['duplicate']);
    writeAgentReport(second, ['duplicate']);
    expect(() =>
      new TestRunReportAssembler().assemble({
        outputDir,
        reportFileName: 'ambiguous',
        sources: [
          { scopeId: 'attempt-2', sourcePath: first },
          { scopeId: 'attempt-2', sourcePath: second },
        ],
        buildRunnerDump: runnerDump,
      }),
    ).toThrow('present in multiple reports');
  });

  it('removes the stale artifact when overwrite switches output modes', () => {
    const root = temporaryDirectory();
    const outputDir = join(root, 'output');
    const assembler = new TestRunReportAssembler();
    const standalonePath = assembler.assemble({
      outputDir,
      reportFileName: 'mode-switch',
      sources: [],
      buildRunnerDump: runnerDump,
    });
    expect(existsSync(standalonePath)).toBe(true);

    const directoryReport = join(root, 'directory-source', 'index.html');
    writeAgentReport(directoryReport, ['directory-execution'], 'directory');
    const directoryPath = assembler.assemble({
      outputDir,
      reportFileName: 'mode-switch',
      sources: [{ scopeId: 'attempt-1', sourcePath: directoryReport }],
      buildRunnerDump: runnerDump,
      overwrite: true,
    });
    expect(existsSync(standalonePath)).toBe(false);
    expect(existsSync(directoryPath)).toBe(true);

    const restoredStandalonePath = assembler.assemble({
      outputDir,
      reportFileName: 'mode-switch',
      sources: [],
      buildRunnerDump: runnerDump,
      overwrite: true,
    });
    expect(existsSync(join(outputDir, 'mode-switch'))).toBe(false);
    expect(existsSync(restoredStandalonePath)).toBe(true);
  });
});
