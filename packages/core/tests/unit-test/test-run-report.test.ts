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
): ReportActionDump => {
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
  return dump;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('TestRunReportAssembler', () => {
  it('merges incremental snapshots once per Agent and scope while preserving coverage', async () => {
    const root = temporaryDirectory();
    const sourcePath = join(root, 'agent.html');
    const first = join(root, 'first.json');
    const second = join(root, 'second.json');
    const otherScope = join(root, 'other.json');
    writeFileSync(
      first,
      writeAgentReport(sourcePath, ['first'], 'inline', true).serialize(),
    );
    writeFileSync(
      second,
      writeAgentReport(sourcePath, ['second'], 'inline', true).serialize(),
    );
    writeFileSync(
      otherScope,
      writeAgentReport(sourcePath, ['other'], 'inline', true).serialize(),
    );
    let index!: TestRunReportSourceIndex;
    const reportPath = await new TestRunReportAssembler().assembleAsync({
      outputDir: join(root, 'out'),
      reportFileName: 'incremental',
      sources: [
        { scopeId: 'case', sourcePath, dumpPath: first },
        {
          scopeId: 'case',
          sourcePath,
          dumpPath: second,
          collection: {
            status: 'partial',
            capturedAt: '2026-10-08T00:00:00.000Z',
          },
        },
        { scopeId: 'other-case', sourcePath, dumpPath: otherScope },
      ],
      buildRunnerDump(value) {
        index = value;
        return runnerDump(value);
      },
    });
    expect(index.sources).toHaveLength(2);
    expect(index.sources[0].executionIds).toEqual(['first', 'second']);
    expect(index.sources[1].executionIds).toEqual(['other']);
    expect(index.sources[0].collection?.status).toBe('partial');
    expect(index.metrics.modelCallCount).toBe(3);
    expect(index.metrics.totalTokens).toBe(21);
    expect(index.metrics.collection?.status).toBe('partial');
    expect(
      readFileSync(reportPath, 'utf8').match(
        /data-report-id="runner-report-1"/g,
      ),
    ).toHaveLength(1);
  });
  it.each([false, true])(
    'retains valid sources and diagnoses unreadable or malformed sources, async=%s',
    async (asyncMode) => {
      const root = temporaryDirectory();
      const sourcePath = join(root, 'good.html');
      writeAgentReport(sourcePath, ['good-execution'], 'inline', true);
      const malformed = join(root, 'malformed.json');
      writeFileSync(malformed, '{broken');
      let index!: TestRunReportSourceIndex;
      const options = {
        outputDir: join(root, 'output'),
        reportFileName: 'partial',
        sources: [
          { scopeId: 'good', sourcePath },
          {
            scopeId: 'missing',
            sourcePath: join(root, 'missing.html'),
            dumpPath: join(root, 'missing.json'),
          },
          {
            scopeId: 'malformed',
            sourcePath: join(root, 'broken.html'),
            dumpPath: malformed,
          },
        ],
        buildRunnerDump(value: TestRunReportSourceIndex) {
          index = value;
          return { ...runnerDump(value), diagnostics: value.diagnostics };
        },
      };
      const assembler = new TestRunReportAssembler();
      const reportPath = asyncMode
        ? await assembler.assembleAsync(options)
        : assembler.assemble(options);
      expect(index.sources.map((source) => source.executionIds)).toEqual([
        ['good-execution'],
      ]);
      expect(index.metrics.modelCallCount).toBe(1);
      expect(index.metrics.totalTokens).toBe(7);
      expect(index.metrics.collection?.status).toBe('partial');
      expect(index.diagnostics?.map((item) => item.scopeId)).toEqual([
        'missing',
        'malformed',
      ]);
      const html = readFileSync(reportPath, 'utf8');
      expect(html).toContain('good-execution');
      expect(html).toContain('agent-source-unavailable');
    },
  );
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
    expect(receivedIndex?.metrics).toMatchObject({
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
