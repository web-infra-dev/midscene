import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Agent } from '@/agent';
import {
  extractTestRunReportDumpSync,
  parseImageScripts,
} from '@/dump/html-utils';
import {
  readReportArtifactManifest,
  readReportDumpScripts,
} from '@/dump/report-artifact-reader';
import type { ReportGenerator } from '@/report-generator';
import {
  enterYamlExecution,
  runInYamlExecutionContext,
} from '@/yaml/execution-session';
import { setMidsceneRunDir } from '@midscene/shared/common';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { extractGroupedDumpScripts } from './test-helpers/report-html';

import * as utilsActual from '@/utils' with { rstest: 'importActual' };

rs.mock('@/utils', () => ({
  ...utilsActual,
  getReportTpl: () => '<html><body></body></html>',
}));

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

function executionIds(html: string): string[] {
  return extractGroupedDumpScripts(html).flatMap(({ content }) =>
    JSON.parse(content).executions.map(({ id }: { id: string }) => id),
  );
}

describe('Agent independent report lifecycle', () => {
  let directory: string;
  let agent: Agent;
  let destroyInterface: ReturnType<typeof rs.fn>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'midscene-agent-reports-'));
    setMidsceneRunDir(directory);
    destroyInterface = rs.fn(async () => {});
  });

  afterEach(async () => {
    await agent?.destroy();
    setMidsceneRunDir(undefined);
    await rm(directory, { recursive: true, force: true });
  });

  function createAgent(
    outputFormat: 'single-html' | 'html-and-external-assets' = 'single-html',
    generateReport = true,
  ) {
    agent = new Agent(
      {
        interfaceType: 'puppeteer',
        actionSpace: () => [],
        destroy: destroyInterface,
      } as any,
      {
        modelConfig,
        outputFormat,
        generateReport,
        persistExecutionDump: generateReport,
        autoPrintReportMsg: false,
        reportFileName: 'configured-report',
      },
    );
  }

  it.each(['single-html', 'html-and-external-assets'] as const)(
    'keeps three runs and their screenshots independent with %s output',
    async (format) => {
      createAgent(format);
      const reports: Array<{ path: string; html: string }> = [];
      const persistedFiles: Array<{ path: string; content: string }> = [];

      for (let run = 0; run < 3; run++) {
        await agent.resetDump();
        expect(agent.reportFile).toBeUndefined();
        await agent.recordToReport('before execution', {
          screenshotBase64: `data:image/png;base64,${Buffer.from(`before-${run}`).toString('base64')}`,
        });
        await agent.recordToReport('same prompt', {
          screenshotBase64: `data:image/png;base64,${Buffer.from(`action-${run}`).toString('base64')}`,
        });
        const ids = agent.dump.executions.map((execution) => execution.id);
        const imageIds = agent.dump
          .collectAllScreenshots()
          .map((screenshot) => screenshot.id);
        const generator = (agent as any).reportManager.reportState.generator;
        expect(generator.recorder.executions.length).toBe(2);
        const reportPath = await agent.finalizeReport();
        expect(generator.recorder.executions.length).toBe(0);
        expect(generator.lastExecution).toBeUndefined();
        expect(agent.dump.executions).toEqual([]);
        expect(reportPath).toBeDefined();
        const html = await readFile(reportPath!, 'utf8');
        expect(
          readReportDumpScripts(reportPath!).flatMap(({ content }) =>
            JSON.parse(content).executions.map(({ id }: { id: string }) => id),
          ),
        ).toEqual(ids);
        const dumpDirectory =
          format === 'single-html'
            ? join(
                dirname(reportPath!),
                '.execution-dumps',
                basename(reportPath!),
              )
            : dirname(reportPath!);
        const dumpPaths =
          format === 'single-html'
            ? (await readdir(dumpDirectory))
                .filter((name) => name.endsWith('.execution.json'))
                .sort()
                .map((name) => join(dumpDirectory, name))
            : readReportArtifactManifest(reportPath!)!.groups.flatMap((group) =>
                group.dumps.map((path) => join(dirname(reportPath!), path)),
              );
        expect(dumpPaths).toHaveLength(2);
        for (const [index, path] of dumpPaths.entries()) {
          const content = await readFile(path, 'utf8');
          const dump = JSON.parse(content);
          expect(
            dump.executions.map((execution: { id: string }) => execution.id),
          ).toEqual([ids[index]]);
          const screenshot = dump.executions[0].tasks[0].recorder[0].screenshot;
          expect(screenshot.storage).toBe('file');
          expect(
            await readFile(
              join(
                format === 'single-html' ? dumpDirectory : dirname(reportPath!),
                screenshot.path,
              ),
            ),
          ).toEqual(
            Buffer.from(index === 0 ? `before-${run}` : `action-${run}`),
          );
          persistedFiles.push({ path, content });
        }
        if (format === 'single-html') {
          expect(Object.keys(parseImageScripts(html)).sort()).toEqual(
            [...imageIds].sort(),
          );
        } else {
          const refs = readReportDumpScripts(reportPath!).flatMap(
            ({ content }) =>
              JSON.parse(content).executions.flatMap((execution: any) =>
                execution.tasks.flatMap((task: any) =>
                  task.recorder.map((record: any) => record.screenshot),
                ),
              ),
          );
          expect(refs.map((ref) => ref.id).sort()).toEqual(
            [...imageIds].sort(),
          );
          for (const ref of refs)
            expect(
              (await readFile(join(dirname(reportPath!), ref.path))).length,
            ).toBeGreaterThan(0);
        }

        reports.push({ path: reportPath!, html });

        // A repeated finalize, the next run and eventual destroy must leave
        // every previously published report byte-for-byte unchanged.
        expect(await agent.finalizeReport()).toBe(reportPath);
        for (const report of reports) {
          expect(await readFile(report.path, 'utf8')).toBe(report.html);
        }
        for (const file of persistedFiles) {
          expect(await readFile(file.path, 'utf8')).toBe(file.content);
        }
      }

      expect(new Set(reports.map(({ path }) => path)).size).toBe(3);
      expect(new Set(persistedFiles.map(({ path }) => path)).size).toBe(6);
      expect(destroyInterface).not.toHaveBeenCalled();
      await agent.destroy();
      for (const report of reports) {
        expect(await readFile(report.path, 'utf8')).toBe(report.html);
      }
      for (const file of persistedFiles) {
        expect(await readFile(file.path, 'utf8')).toBe(file.content);
      }
    },
  );

  it('does not reuse the preceding execution when the next run has no dump', async () => {
    createAgent();
    await agent.resetDump();
    await agent.recordToReport('first run', { screenshotBase64: 'AAAA' });
    const firstPath = await agent.finalizeReport();
    const firstHtml = await readFile(firstPath!, 'utf8');

    await agent.resetDump();
    expect(agent.dump.executions).toEqual([]);
    expect(await agent.flushReport()).toBeUndefined();
    expect(await agent.finalizeReport()).toBeUndefined();
    expect(agent.reportFile).toBeUndefined();
    expect(await readFile(firstPath!, 'utf8')).toBe(firstHtml);
  });

  it('keeps ordinary SDK calls in one report until explicitly reset', async () => {
    createAgent();
    await agent.recordToReport('first SDK call', { screenshotBase64: 'AAAA' });
    const firstPath = agent.reportFile;
    const firstId = agent.dump.executions[0].id;
    await agent.recordToReport('second SDK call', { screenshotBase64: 'AQ==' });
    const secondId = agent.dump.executions[1].id;
    await agent.destroy();

    expect(agent.reportFile).toBe(firstPath);
    expect(executionIds(await readFile(firstPath!, 'utf8'))).toEqual([
      firstId,
      secondId,
    ]);
  });

  it('finalizes the preceding SDK report when resetDump is awaited', async () => {
    createAgent();
    await agent.recordToReport('first SDK run', { screenshotBase64: 'AAAA' });
    const firstPath = agent.reportFile!;
    const firstId = agent.dump.executions[0].id;
    const dump = await agent.resetDump();
    const firstHtml = await readFile(firstPath, 'utf8');
    expect(executionIds(firstHtml)).toEqual([firstId]);
    expect(dump).toBe(agent.dump);
    expect(dump.executions).toEqual([]);
    expect(agent.reportFile).toBeUndefined();

    await agent.recordToReport('second SDK run', { screenshotBase64: 'AQ==' });
    const secondId = agent.dump.executions[0].id;
    const secondPath = await agent.finalizeReport();
    expect(secondPath).not.toBe(firstPath);
    expect(executionIds(await readFile(secondPath!, 'utf8'))).toEqual([
      secondId,
    ]);
    expect(await readFile(firstPath, 'utf8')).toBe(firstHtml);
    expect(agent.dump.executions).toEqual([]);
    expect(destroyInterface).not.toHaveBeenCalled();
  });

  it('shares concurrent resets and prevents actions until reset completes', async () => {
    createAgent();
    await agent.recordToReport('preceding run', { screenshotBase64: 'AAAA' });
    const generator = (agent as any).reportManager.reportState
      .generator as ReportGenerator;
    const finalize = generator.finalize.bind(generator);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finalization = rs
      .spyOn(generator, 'finalize')
      .mockImplementation(async () => {
        await pending;
        return finalize();
      });
    const first = agent.resetDump();
    const second = agent.resetDump();
    try {
      await expect(
        agent.recordToReport('too early', { screenshotBase64: 'AQ==' }),
      ).rejects.toThrow('Await resetDump() first');
      await expect(agent.startObserving()).rejects.toThrow(
        'Await resetDump() first',
      );
    } finally {
      release();
    }
    const [firstDump, secondDump] = await Promise.all([first, second]);
    expect(firstDump).toBe(secondDump);
    expect(finalization).toHaveBeenCalledOnce();
    const fileName = agent.reportFileName;
    await agent.resetDump();
    expect(agent.reportFileName).not.toBe(fileName);
    expect(await agent.finalizeReport()).toBeUndefined();
  });

  it.each(
    (['registration', 'completion'] as const).flatMap((phase) =>
      [false, true].map((fails) => ({ phase, fails })),
    ),
  )(
    'protects aiTap file chooser $phase, including failure=$fails',
    async ({ phase, fails }) => {
      createAgent();
      const upload = join(directory, 'upload.txt');
      await writeFile(upload, 'fixture');
      let started!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const error = new Error('file chooser failed');
      const dispose = rs.fn(() => {
        // Disposal is part of the public operation too.
        expect(
          (agent as any).reportManager.reportState.activeOperations.size,
        ).toBeGreaterThan(0);
      });
      const wait = async () => {
        started();
        await gate;
        if (fails) throw error;
      };
      agent.interface.registerFileChooserListener = async () => {
        if (phase === 'registration') await wait();
        return {
          dispose,
          getError: async () => {
            if (phase === 'completion') await wait();
            return undefined;
          },
        };
      };
      const click = rs
        .spyOn(agent, 'callActionInActionSpace')
        .mockResolvedValue(undefined);
      const tapping = agent.aiTap('upload', { fileChooserAccept: upload });
      const settled = tapping.then(
        () => undefined,
        (failure) => failure,
      );
      await entered;
      const reportName = agent.reportFileName;
      try {
        await expect(agent.resetDump()).rejects.toThrow('Agent is executing');
        await expect(agent.finalizeReport()).rejects.toThrow(
          'Agent is executing',
        );
        expect(agent.reportFileName).toBe(reportName);
        expect(click).toHaveBeenCalledTimes(phase === 'registration' ? 0 : 1);
      } finally {
        release();
      }
      expect(await settled).toBe(fails ? error : undefined);
      expect(dispose).toHaveBeenCalledTimes(
        phase === 'registration' && fails ? 0 : 1,
      );
      await agent.resetDump();
      expect(agent.reportFileName).not.toBe(reportName);
    },
  );

  it('rejects reset and finalization while screenshot capture is unfinished', async () => {
    createAgent();
    let started!: () => void;
    let release!: () => void;
    const capturing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const screenshot = new Promise<string>((resolve) => {
      release = () => resolve('AAAA');
    });
    agent.interface.screenshotBase64 = async () => {
      started();
      return screenshot;
    };
    const recording = agent.recordToReport('pending screenshot');
    await capturing;
    const fileName = agent.reportFileName;
    try {
      await expect(agent.resetDump()).rejects.toThrow('Agent is executing');
      await expect(agent.finalizeReport()).rejects.toThrow(
        'Agent is executing',
      );
      expect(agent.reportFileName).toBe(fileName);
    } finally {
      release();
      await recording;
    }
    await agent.resetDump();
    expect(agent.reportFileName).not.toBe(fileName);
  });

  it('does not reset an active YAML owner even between its actions', async () => {
    createAgent();
    await runInYamlExecutionContext(async () => {
      const owner = enterYamlExecution(agent);
      try {
        await expect(agent.resetDump()).rejects.toThrow('Agent is executing');
      } finally {
        owner.finish();
      }
    });
    await agent.resetDump();
  });

  it('keeps flushReport writable but seals finalized reports until reset', async () => {
    createAgent();
    await agent.recordToReport('first step', { screenshotBase64: 'AAAA' });
    const path = await agent.flushReport();
    await agent.recordToReport('second step', { screenshotBase64: 'AQ==' });
    expect(agent.dump.executions).toHaveLength(2);
    expect(await agent.finalizeReport()).toBe(path);
    const html = await readFile(path!, 'utf8');
    await expect(
      agent.recordToReport('late step', { screenshotBase64: 'AQ==' }),
    ).rejects.toThrow('report has been finalized');
    expect(await agent.flushReport()).toBe(path);
    expect(await readFile(path!, 'utf8')).toBe(html);
    await agent.resetDump();
    await agent.recordToReport('fresh step', { screenshotBase64: 'AQ==' });
  });

  it('rejects a preceding runner callback instead of writing it into the new report', async () => {
    createAgent();
    const hooks = (agent as any).taskExecutor.hooks;
    const runner = { dump: rs.fn() };
    hooks.onExecutionCreated(runner);
    await agent.recordToReport('old run', { screenshotBase64: 'AAAA' });
    const oldPath = await agent.finalizeReport();
    const oldHtml = await readFile(oldPath!, 'utf8');
    await agent.resetDump();
    await agent.recordToReport('new run', { screenshotBase64: 'AQ==' });
    const ids = agent.dump.executions.map(({ id }) => id);
    await expect(hooks.onSnapshotChange(runner)).rejects.toThrow(
      'late execution update',
    );
    expect(runner.dump).not.toHaveBeenCalled();
    const path = await agent.finalizeReport();
    expect(executionIds(await readFile(path!, 'utf8'))).toEqual(ids);
    expect(await readFile(oldPath!, 'utf8')).toBe(oldHtml);
  });

  it('waits for active SDK work on destroy without creating another report', async () => {
    createAgent();
    let release!: () => void;
    let started!: () => void;
    const startedCapture = new Promise<void>((resolve) => {
      started = resolve;
    });
    agent.interface.screenshotBase64 = async () => {
      started();
      return new Promise<string>((resolve) => {
        release = () => resolve('AAAA');
      });
    };
    const recording = agent.recordToReport('last screenshot');
    await startedCapture;
    const fileName = agent.reportFileName;
    const disposal = agent.destroy();
    expect(destroyInterface).not.toHaveBeenCalled();
    release();
    await Promise.all([recording, disposal]);
    expect(destroyInterface).toHaveBeenCalledOnce();
    expect(agent.reportFileName).toBe(fileName);
    expect(
      executionIds(await readFile(agent.reportFile!, 'utf8')),
    ).toHaveLength(1);
    await expect(agent.resetDump()).rejects.toThrow('destroyed Agent');
  });

  it('supports disabled reports without disposing the device between runs', async () => {
    createAgent('single-html', false);
    for (let run = 0; run < 2; run++) {
      await agent.resetDump();
      await agent.recordToReport('unpersisted', { screenshotBase64: 'AAAA' });
      expect(await agent.finalizeReport()).toBeUndefined();
      expect(agent.reportFile).toBeUndefined();
    }
    expect(destroyInterface).not.toHaveBeenCalled();
  });

  it('starts a fresh YAML hierarchy for each independent report', async () => {
    createAgent();
    const scopeIds: string[] = [];
    for (const name of ['first case', 'second case']) {
      await agent.resetDump();
      await agent.runYaml(`tasks: [{ name: ${name}, flow: [] }]`);
      const path = await agent.finalizeReport();
      const dump = extractTestRunReportDumpSync(path!)!;
      expect(dump.summary.total).toBe(1);
      const document = dump.projects[0].documents[0];
      expect(document.cases.map((entry) => entry.name)).toEqual([name]);
      scopeIds.push(dump.runId);
    }
    expect(new Set(scopeIds).size).toBe(2);
  });

  it('resets inline YAML exports when no filesystem report is generated', async () => {
    createAgent('single-html', false);
    await agent.runYaml('tasks: [{ name: inline-first-yaml, flow: [] }]');
    const first = agent.reportHTMLString();
    expect(first).toContain('inline-first-yaml');
    await agent.resetDump();
    await agent.runYaml('tasks: [{ name: inline-second-yaml, flow: [] }]');
    const second = agent.reportHTMLString();
    expect(second).toContain('inline-second-yaml');
    expect(second).not.toContain('inline-first-yaml');
    expect(await agent.finalizeReport()).toBeUndefined();
    expect(first).not.toContain('inline-second-yaml');
  });

  it.each(['finalization', 'queued write'] as const)(
    'starts two subsequent reports after a real %s failure',
    async (failure) => {
      createAgent();
      await agent.resetDump();
      const generator = (
        agent as unknown as {
          reportManager: { reportState: { generator: ReportGenerator } };
        }
      ).reportManager.reportState.generator;
      const error = new Error(`injected ${failure} failure`);
      if (failure === 'queued write') {
        rs.spyOn(
          generator as unknown as { doWriteExecution: () => Promise<void> },
          'doWriteExecution',
        ).mockRejectedValueOnce(error);
        await expect(
          agent.recordToReport('failed write', { screenshotBase64: 'AAAA' }),
        ).rejects.toBe(error);
      } else {
        await agent.recordToReport('failed finalization', {
          screenshotBase64: 'AAAA',
        });
        rs.spyOn(generator, 'finalize').mockRejectedValueOnce(error);
      }
      await expect(agent.finalizeReport()).rejects.toBe(error);
      const paths: string[] = [];
      for (let run = 0; run < 2; run++) {
        await agent.resetDump();
        await agent.recordToReport(`recovered-${run}`, {
          screenshotBase64: 'AQ==',
        });
        const ids = agent.dump.executions.map((execution) => execution.id);
        const path = await agent.finalizeReport();
        const html = await readFile(path!, 'utf8');
        expect(
          readReportDumpScripts(path!).flatMap(({ content }) =>
            JSON.parse(content).executions.map(({ id }: { id: string }) => id),
          ),
        ).toEqual(ids);
        expect(html).not.toContain('failed finalization');
        paths.push(path!);
      }
      expect(new Set(paths).size).toBe(2);
      expect(destroyInterface).not.toHaveBeenCalled();
    },
  );
});
