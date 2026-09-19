import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { generateDumpScriptTag } from '../../src/dump';
import { createReportCliCommands } from '../../src/report-cli';
import {
  getReportMetadata,
  readReportMetadata,
} from '../../src/report-metadata';
import {
  ExecutionDump,
  ReportActionDump,
  type ReportMeta,
} from '../../src/types';

type TaskShape = {
  status: 'pending' | 'running' | 'finished' | 'failed' | 'cancelled';
  subType?: string;
  errorMessage?: string;
  output?: unknown;
};

const TEST_REPORT_META = {
  groupName: 'metadata-test',
  groupDescription: 'metadata test report',
  sdkVersion: '1.0.0-test',
  modelBriefs: [{ intent: 'planning', name: 'test-model' }],
  deviceType: 'browser',
} satisfies ReportMeta;

function buildExecution(id: string, tasks: TaskShape[]): ExecutionDump {
  return new ExecutionDump({
    id,
    logTime: Date.now(),
    name: `execution-${id}`,
    tasks: tasks.map((task, index) => ({
      taskId: `task-${id}-${index}`,
      type: 'Insight',
      subType: task.subType ?? 'Locate',
      param: { prompt: 'read report metadata' },
      executor: async () => undefined,
      recorder: [],
      status: task.status,
      ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
      ...('output' in task ? { output: task.output } : {}),
    })) as any,
  });
}

function buildDump(executions: ExecutionDump[]): ReportActionDump {
  return new ReportActionDump({
    ...TEST_REPORT_META,
    executions,
  });
}

describe('report metadata', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `midscene-report-metadata-${Date.now()}-${Math.random()}`,
    );
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rs.unstubAllGlobals();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function writeReport(
    dumps: ReportActionDump[],
    reportDirName = 'report',
  ): string {
    const reportDir = join(tmpDir, reportDirName);
    const reportPath = join(reportDir, 'index.html');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      reportPath,
      dumps
        .map((dump) =>
          generateDumpScriptTag(dump.serialize(), {
            'data-group-id': 'metadata-group',
          }),
        )
        .join('\n'),
      'utf8',
    );
    return reportPath;
  }

  it('returns deterministic metadata for a local report file', () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('first', [{ status: 'finished' }]),
        buildExecution('second', [
          { status: 'finished' },
          { status: 'failed', errorMessage: 'recorded failure' },
        ]),
      ]),
    ]);

    expect(readReportMetadata({ report: reportPath })).toEqual({
      ...TEST_REPORT_META,
      schemaVersion: 1,
      source: reportPath,
      resolvedHtmlPath: reportPath,
      executionStatus: 'fail',
      lastTaskStatus: 'failed',
      executionCount: 2,
      taskCount: 3,
    });
  });

  it('resolves a report directory to index.html', () => {
    const reportPath = writeReport([
      buildDump([buildExecution('directory', [{ status: 'finished' }])]),
    ]);
    const reportDirectory = dirname(reportPath);

    expect(readReportMetadata({ report: reportDirectory })).toEqual({
      ...TEST_REPORT_META,
      schemaVersion: 1,
      source: reportDirectory,
      resolvedHtmlPath: reportPath,
      executionStatus: 'pass',
      lastTaskStatus: 'passed',
      executionCount: 1,
      taskCount: 1,
    });
  });

  it.each([
    [{ status: 'finished' }, 'pass', 'passed'],
    [
      { status: 'finished', subType: 'WaitFor', output: false },
      'pass',
      'warning',
    ],
    [{ status: 'failed' }, 'fail', 'failed'],
    [{ status: 'pending' }, 'incomplete', 'pending'],
    [{ status: 'running' }, 'incomplete', 'running'],
    [{ status: 'cancelled' }, 'incomplete', 'cancelled'],
  ] as const)(
    'maps the final task %s to execution status %s',
    async (finalTask, executionStatus, lastTaskStatus) => {
      const reportPath = writeReport([
        buildDump([
          buildExecution('last-task-wins', [
            { status: 'failed', errorMessage: 'earlier failure' },
            { ...finalTask },
          ]),
        ]),
      ]);

      const metadata = await getReportMetadata({ report: reportPath });

      expect(metadata.executionStatus).toBe(executionStatus);
      expect(metadata.lastTaskStatus).toBe(lastTaskStatus);
    },
  );

  it('returns unknown and incomplete when the report has no tasks', () => {
    const reportPath = writeReport([buildDump([buildExecution('empty', [])])]);

    const metadata = readReportMetadata({ report: reportPath });

    expect(metadata.lastTaskStatus).toBe('unknown');
    expect(metadata.executionStatus).toBe('incomplete');
    expect(metadata.executionCount).toBe(1);
    expect(metadata.taskCount).toBe(0);
  });

  it('uses only the latest snapshot of an execution id', () => {
    const reportPath = writeReport([
      buildDump([
        buildExecution('deduped', [
          { status: 'failed', errorMessage: 'recovered failure' },
        ]),
      ]),
      buildDump([
        buildExecution('deduped', [
          { status: 'finished' },
          { status: 'finished' },
        ]),
      ]),
    ]);

    const metadata = readReportMetadata({ report: reportPath });

    expect(metadata.executionStatus).toBe('pass');
    expect(metadata.executionCount).toBe(1);
    expect(metadata.taskCount).toBe(2);
  });

  it('rejects a truncated trailing dump', async () => {
    const reportPath = writeReport([
      buildDump([buildExecution('stale', [{ status: 'finished' }])]),
    ]);
    appendFileSync(
      reportPath,
      '\n<script type="midscene_web_dump" data-group-id="metadata-group">{"groupName":',
      'utf8',
    );

    expect(() => readReportMetadata({ report: reportPath })).toThrow(
      'Report dump is truncated or incomplete',
    );
    await expect(getReportMetadata({ report: reportPath })).rejects.toThrow(
      'Report dump is truncated or incomplete',
    );
  });

  it('accepts an unclosed dump tag when its JSON is complete', () => {
    const reportPath = writeReport([
      buildDump([buildExecution('stale', [{ status: 'finished' }])]),
    ]);
    const completeDump = buildDump([
      buildExecution('newer', [{ status: 'failed' }]),
    ]).serialize();
    appendFileSync(
      reportPath,
      `\n<script type="midscene_web_dump" data-group-id="metadata-group">${completeDump}`,
      'utf8',
    );

    const metadata = readReportMetadata({ report: reportPath });

    expect(metadata.executionStatus).toBe('fail');
    expect(metadata.lastTaskStatus).toBe('failed');
  });

  it('exposes metadata through a side-effect-free CLI action', async () => {
    const reportPath = writeReport([
      buildDump([buildExecution('cli', [{ status: 'finished' }])]),
    ]);
    const reportDirectory = dirname(reportPath);
    const before = readdirSync(tmpDir, { recursive: true });
    const [command] = createReportCliCommands();

    const response = await command.def.handler({
      action: 'metadata',
      report: reportDirectory,
    });
    const metadata = JSON.parse(response.content[0].text);

    expect(response.isError).toBe(false);
    expect(metadata).toEqual({
      ...TEST_REPORT_META,
      schemaVersion: 1,
      source: reportDirectory,
      resolvedHtmlPath: reportPath,
      executionStatus: 'pass',
      lastTaskStatus: 'passed',
      executionCount: 1,
      taskCount: 1,
    });
    expect(readdirSync(tmpDir, { recursive: true })).toEqual(before);
  });

  it('requires --report for the metadata CLI action', async () => {
    const [command] = createReportCliCommands();

    await expect(command.def.handler({ action: 'metadata' })).rejects.toThrow(
      'report-tool: --report is required for action "metadata"',
    );
  });

  it('throws for missing and unparseable local reports', async () => {
    const missingPath = join(tmpDir, 'missing.html');
    expect(() => readReportMetadata({ report: missingPath })).toThrow(
      'Report path does not exist',
    );
    await expect(getReportMetadata({ report: missingPath })).rejects.toThrow(
      'Report path does not exist',
    );

    const invalidPath = join(tmpDir, 'invalid.html');
    writeFileSync(invalidPath, '<html>no report dump</html>', 'utf8');
    expect(() => readReportMetadata({ report: invalidPath })).toThrow(
      'No report dump scripts found',
    );
  });

  it('materializes a remote report for follow-up actions', async () => {
    const sourcePath = writeReport([
      buildDump([buildExecution('url', [{ status: 'finished' }])]),
    ]);
    rs.stubGlobal(
      'fetch',
      rs.fn().mockResolvedValue(
        new Response(readFileSync(sourcePath), {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    const reportUrl = 'https://example.test/report.html?case=url';
    const metadata = await getReportMetadata({ report: reportUrl });
    try {
      expect(metadata).toMatchObject({
        ...TEST_REPORT_META,
        schemaVersion: 1,
        source: reportUrl,
        executionStatus: 'pass',
        lastTaskStatus: 'passed',
        executionCount: 1,
        taskCount: 1,
      });
      expect(metadata.resolvedHtmlPath).toMatch(
        /midscene-report-metadata-.*report\.html$/,
      );
      expect(existsSync(metadata.resolvedHtmlPath)).toBe(true);
    } finally {
      rmSync(dirname(metadata.resolvedHtmlPath), {
        recursive: true,
        force: true,
      });
    }
  });
});
