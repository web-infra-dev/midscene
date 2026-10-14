import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Agent } from '@/agent';
import {
  extractTestRunReportDumpSync,
  parseImageScripts,
} from '@/dump/html-utils';
import type { ReportGenerator } from '@/report-generator';
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
        await agent._startNewReport();
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
        const reportPath = await agent._finalizeReport();
        expect(reportPath).toBeDefined();
        const html = await readFile(reportPath!, 'utf8');
        expect(executionIds(html)).toEqual(ids);
        const dumpDirectory =
          format === 'single-html'
            ? join(
                dirname(reportPath!),
                '.execution-dumps',
                basename(reportPath!),
              )
            : dirname(reportPath!);
        const dumpNames = (await readdir(dumpDirectory))
          .filter((name) => name.endsWith('.execution.json'))
          .sort();
        expect(dumpNames).toEqual(['1.execution.json', '2.execution.json']);
        for (const [index, name] of dumpNames.entries()) {
          const path = join(dumpDirectory, name);
          const content = await readFile(path, 'utf8');
          const dump = JSON.parse(content);
          expect(
            dump.executions.map((execution: { id: string }) => execution.id),
          ).toEqual([ids[index]]);
          const screenshot = dump.executions[0].tasks[0].recorder[0].screenshot;
          expect(screenshot.storage).toBe('file');
          expect(await readFile(join(dumpDirectory, screenshot.path))).toEqual(
            Buffer.from(index === 0 ? `before-${run}` : `action-${run}`),
          );
          persistedFiles.push({ path, content });
        }
        if (format === 'single-html') {
          expect(Object.keys(parseImageScripts(html)).sort()).toEqual(
            [...imageIds].sort(),
          );
        } else {
          for (const id of imageIds) {
            const screenshotPath = join(
              reportPath!,
              '..',
              'screenshots',
              `${id}.png`,
            );
            expect((await readFile(screenshotPath)).length).toBeGreaterThan(0);
          }
        }
        reports.push({ path: reportPath!, html });

        // A repeated finalize, the next run and eventual destroy must leave
        // every previously published report byte-for-byte unchanged.
        expect(await agent._finalizeReport()).toBe(reportPath);
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
    await agent._startNewReport();
    await agent.recordToReport('first run', { screenshotBase64: 'AAAA' });
    const firstPath = await agent._finalizeReport();
    const firstHtml = await readFile(firstPath!, 'utf8');

    await agent._startNewReport();
    expect(agent.dump.executions).toEqual([]);
    expect(await agent.flushReport()).toBeUndefined();
    expect(await agent._finalizeReport()).toBeUndefined();
    expect(agent.reportFile).toBeUndefined();
    expect(await readFile(firstPath!, 'utf8')).toBe(firstHtml);
  });

  it('keeps ordinary SDK calls in one report across an in-memory reset', async () => {
    createAgent();
    await agent.recordToReport('first SDK call', { screenshotBase64: 'AAAA' });
    const firstPath = agent.reportFile;
    const firstId = agent.dump.executions[0].id;
    agent.resetDump();
    await agent.recordToReport('second SDK call', { screenshotBase64: 'AQ==' });
    const secondId = agent.dump.executions[0].id;
    await agent.destroy();

    expect(agent.reportFile).toBe(firstPath);
    expect(executionIds(await readFile(firstPath!, 'utf8'))).toEqual([
      firstId,
      secondId,
    ]);
  });

  it('supports disabled reports without disposing the device between runs', async () => {
    createAgent('single-html', false);
    for (let run = 0; run < 2; run++) {
      await agent._startNewReport();
      await agent.recordToReport('unpersisted', { screenshotBase64: 'AAAA' });
      expect(await agent._finalizeReport()).toBeUndefined();
      expect(agent.reportFile).toBeUndefined();
    }
    expect(destroyInterface).not.toHaveBeenCalled();
  });

  it('starts a fresh YAML hierarchy for each independent report', async () => {
    createAgent();
    const scopeIds: string[] = [];
    for (const name of ['first case', 'second case']) {
      await agent._startNewReport();
      await agent.runYaml(`tasks: [{ name: ${name}, flow: [] }]`);
      const path = await agent._finalizeReport();
      const dump = extractTestRunReportDumpSync(path!)!;
      expect(dump.summary.total).toBe(1);
      const document = dump.projects[0].documents[0];
      expect(document.cases.map((entry) => entry.name)).toEqual([name]);
      scopeIds.push(dump.runId);
    }
    expect(new Set(scopeIds).size).toBe(2);
  });

  it.each(['finalization', 'queued write'] as const)(
    'starts two subsequent reports after a real %s failure',
    async (failure) => {
      createAgent();
      await agent._startNewReport();
      const generator = (
        agent as unknown as { reportGenerator: ReportGenerator }
      ).reportGenerator;
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
      await expect(agent._finalizeReport()).rejects.toBe(error);
      const paths: string[] = [];
      for (let run = 0; run < 2; run++) {
        await agent._startNewReport();
        await agent.recordToReport(`recovered-${run}`, {
          screenshotBase64: 'AQ==',
        });
        const path = await agent._finalizeReport();
        const html = await readFile(path!, 'utf8');
        expect(executionIds(html)).toEqual(
          agent.dump.executions.map((execution) => execution.id),
        );
        expect(html).not.toContain('failed finalization');
        paths.push(path!);
      }
      expect(new Set(paths).size).toBe(2);
      expect(destroyInterface).not.toHaveBeenCalled();
    },
  );
});
