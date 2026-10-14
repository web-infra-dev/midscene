import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent';
import {
  extractTestRunReportDumpSync,
  parseImageScripts,
} from '@/dump/html-utils';
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
      }

      expect(new Set(reports.map(({ path }) => path)).size).toBe(3);
      expect(destroyInterface).not.toHaveBeenCalled();
      await agent.destroy();
      for (const report of reports) {
        expect(await readFile(report.path, 'utf8')).toBe(report.html);
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
});
