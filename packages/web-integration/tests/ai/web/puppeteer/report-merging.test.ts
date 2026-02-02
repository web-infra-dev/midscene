import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { ReportMergingTool } from '@midscene/core/report';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { launchPage } from './utils';

const FIXTURES_DIR = path.join(__dirname, '../../fixtures');
const getFixturePath = (filename: string) => path.join(FIXTURES_DIR, filename);

vi.setConfig({
  testTimeout: 120 * 1000,
});

describe('ReportMergingTool integration', () => {
  let resetFn: () => Promise<void>;
  let agent: PuppeteerAgent;
  let startTime: number;
  const reportMergingTool = new ReportMergingTool();
  let mergedReportPath: string | null = null;

  beforeEach(() => {
    startTime = performance.now();
  });

  afterEach(async (ctx) => {
    // Determine workflow status
    let workflowStatus = 'passed';
    if (ctx.task.result?.state === 'pass') {
      workflowStatus = 'passed';
    } else if (ctx.task.result?.state === 'skip') {
      workflowStatus = 'skipped';
    } else if (ctx.task.result?.errors?.[0]?.message.includes('timed out')) {
      workflowStatus = 'timedOut';
    } else if (ctx.task.result?.state === 'fail') {
      workflowStatus = 'failed';
    }

    // Add report to merge list if agent exists and has a report
    if (agent?.reportFile) {
      reportMergingTool.append({
        reportFilePath: agent.reportFile,
        reportAttributes: {
          testId: ctx.task.id,
          testTitle: ctx.task.name,
          testDescription: `Puppeteer automation test: ${ctx.task.name}`,
          testDuration: Math.round(performance.now() - startTime),
          testStatus: workflowStatus,
        },
      });
    }

    // Clean up
    if (agent) {
      try {
        await agent.destroy();
      } catch (e) {
        console.warn('agent destroy error', e);
      }
    }
    if (resetFn) {
      await resetFn();
    }
  });

  afterAll(() => {
    // Merge all reports
    mergedReportPath = reportMergingTool.mergeReports(
      'puppeteer-report-merging-test',
      { overwrite: true },
    );
    console.log('Merged report path:', mergedReportPath);

    // Verify the merged report exists and contains expected content
    if (mergedReportPath) {
      expect(existsSync(mergedReportPath)).toBe(true);
      const content = readFileSync(mergedReportPath, 'utf-8');
      // Should contain the report template
      expect(content).toContain('<!doctype html>');
      expect(content).toContain('Midscene');
      // Should contain dump script tags from merged reports
      expect(content).toContain('midscene_web_dump');
      console.log('Merged report verified successfully!');
    }
  });

  it('search weather on search engine', async () => {
    const htmlPath = getFixturePath('search-engine.html');
    const { originPage, reset } = await launchPage(`file://${htmlPath}`);
    resetFn = reset;
    agent = new PuppeteerAgent(originPage, {
      cacheId: 'report-merge-test-search',
    });

    await agent.aiAct('input "weather today" in the search box');
    await agent.aiAssert('the search box contains "weather today"');
  });

  it('test input interactions', async () => {
    const htmlPath = getFixturePath('input-test.html');
    const { originPage, reset } = await launchPage(`file://${htmlPath}`);
    resetFn = reset;
    agent = new PuppeteerAgent(originPage, {
      cacheId: 'report-merge-test-input',
    });

    await agent.aiInput('search input box', { value: 'hello world' });
    await agent.aiAssert('the input contains "hello world"');
  });

  it('verify drag and drop functionality', async () => {
    const htmlPath = getFixturePath('drag-and-drop.html');
    const { originPage, reset } = await launchPage(`file://${htmlPath}`);
    resetFn = reset;
    agent = new PuppeteerAgent(originPage, {
      cacheId: 'report-merge-test-drag',
    });

    await agent.aiAct('drag element A to element B');
    await agent.aiAssert('element A is now on the right side of element B');
  });
});
