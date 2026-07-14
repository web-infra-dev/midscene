import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import path from 'node:path';
import { parseDumpScript } from '@midscene/core';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_RETRY_COUNT,
  MIDSCENE_MODEL_TIMEOUT,
} from '@midscene/shared/env';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it, vi } from 'vitest';
import { type IOSAgent, agentFromWebDriverAgent } from '../../src';

const RUN_LIVE_SMOKE =
  process.env.AI_TEST_TYPE === 'iOS' &&
  process.env.MIDSCENE_IOS_SIMULATOR_SMOKE === '1';
const REPORT_FILE_NAME = 'ios-simulator-smoke';
const REPORT_HTML_FILE_NAME = `${REPORT_FILE_NAME}.html`;
const INPUT_ACCESSIBILITY_ID = 'Midscene Smoke Input';
const SUBMITTED_TEXT = 'Midscene iOS input 2026';
const POLL_INTERVAL_MS = 500;
const TARGET_TIMEOUT_MS = 60_000;
const W3C_ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

interface WdaValueResponse<T> {
  value: T;
  sessionId?: string;
}

interface WdaElementValue {
  ELEMENT?: string;
  [W3C_ELEMENT_KEY]?: string;
}

interface WdaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ReportTask {
  type?: string;
  subType?: string;
  hitBy?: { from?: string };
  timing?: { callAiStart?: number; callAiEnd?: number };
  usage?: unknown;
  searchAreaUsage?: unknown;
}

interface ReportExecution {
  id?: string;
  name?: string;
  tasks?: ReportTask[];
}

interface ReportDump {
  executions?: ReportExecution[];
}

vi.setConfig({ testTimeout: 240_000, hookTimeout: 30_000 });

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

function screenshotBuffer(base64: string): Buffer {
  const match = /^data:image\/\w+;base64,(.+)$/s.exec(base64);
  if (!match) {
    throw new Error('iOS Simulator screenshot is not a base64 data URL');
  }
  return Buffer.from(match[1], 'base64');
}

function locate(rect: WdaRect, screenshotScale: number, prompt: string) {
  return {
    prompt,
    locatedPixelBbox: [
      Math.round(rect.x * screenshotScale),
      Math.round(rect.y * screenshotScale),
      Math.round((rect.x + rect.width) * screenshotScale),
      Math.round((rect.y + rect.height) * screenshotScale),
    ] as [number, number, number, number],
  };
}

function xmlAttribute(nodeTag: string, attribute: string): string | undefined {
  return new RegExp(`${attribute}="([^"]*)"`).exec(nodeTag)?.[1];
}

function parseReportDumps(html: string): ReportDump[] {
  const marker = '<script type="midscene_web_dump"';
  const closeTag = '</script>';
  const dumps: ReportDump[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const openIndex = html.indexOf(marker, cursor);
    if (openIndex === -1) break;
    const closeIndex = html.indexOf(closeTag, openIndex);
    if (closeIndex === -1) break;
    const prefix = html.slice(0, closeIndex + closeTag.length);
    try {
      const parsed = JSON.parse(parseDumpScript(prefix)) as ReportDump;
      if (Array.isArray(parsed.executions)) {
        dumps.push(parsed);
      }
    } catch {
      // The report application contains the marker as source text too.
    }
    cursor = closeIndex + closeTag.length;
  }

  return dumps;
}

function latestExecutions(dumps: ReportDump[]): ReportExecution[] {
  const byKey = new Map<string, ReportExecution>();
  let anonymousIndex = 0;
  for (const dump of dumps) {
    for (const execution of dump.executions ?? []) {
      const key =
        execution.id || execution.name || `anonymous-${anonymousIndex++}`;
      byKey.set(key, execution);
    }
  }
  return Array.from(byKey.values());
}

async function startFixtureServer(): Promise<{
  server: Server;
  url: string;
  submittedValue: () => string | undefined;
}> {
  let submittedValue: string | undefined;
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/submitted') {
      submittedValue = requestUrl.searchParams.get('value') ?? undefined;
      response.writeHead(204).end();
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(`<!doctype html>
<html lang="en">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Midscene iOS Simulator Smoke</title>
  <style>
    body { margin: 0; font: 20px -apple-system, sans-serif; background: #f4f7f5; color: #163020; }
    main { padding: 64px 24px; }
    label { display: block; margin-bottom: 12px; font-weight: 700; }
    input { box-sizing: border-box; width: 100%; padding: 16px; border: 3px solid #16813d; border-radius: 10px; font-size: 20px; }
    output { display: block; margin-top: 28px; padding: 18px; min-height: 28px; background: #c9f4d7; border-radius: 10px; }
  </style>
  <main>
    <form id="smoke-form">
      <label for="smoke-input">Midscene Smoke Input</label>
      <input id="smoke-input" aria-label="${INPUT_ACCESSIBILITY_ID}" autocomplete="off">
      <output id="result" aria-live="polite">Waiting for input</output>
    </form>
  </main>
  <script>
    document.querySelector('#smoke-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = document.querySelector('#smoke-input').value;
      document.querySelector('#result').textContent = 'Submitted: ' + value;
      await fetch('/submitted?value=' + encodeURIComponent(value));
    });
  </script>
</html>`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine iOS smoke fixture server port');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
    submittedValue: () => submittedValue,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForElementRect(
  agent: IOSAgent,
  sourceFile: string,
  accessibilityId: string,
  elementType: 'XCUIElementTypeTextField',
): Promise<{ elementId: string; rect: WdaRect; source: string }> {
  const deadline = Date.now() + TARGET_TIMEOUT_MS;
  let lastSource = '';
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const sourceResponse = (await agent.runWdaRequest({
        method: 'GET',
        endpoint: '/source',
      })) as WdaValueResponse<string>;
      lastSource = sourceResponse.value;
      await writeFile(sourceFile, lastSource, 'utf8');

      const elementResponse = (await agent.runWdaRequest({
        method: 'POST',
        endpoint: '/element',
        data: {
          using: 'predicate string',
          value: `type == '${elementType}' AND name == '${accessibilityId}'`,
        },
      })) as WdaValueResponse<WdaElementValue>;
      const elementId =
        elementResponse.value[W3C_ELEMENT_KEY] || elementResponse.value.ELEMENT;
      if (!elementId) {
        throw new Error('WDA element response did not contain an element id');
      }

      const rectResponse = (await agent.runWdaRequest({
        method: 'GET',
        endpoint: `/element/${encodeURIComponent(elementId)}/rect`,
      })) as WdaValueResponse<WdaRect>;
      const rect = rectResponse.value;
      if (rect.width <= 0 || rect.height <= 0) {
        throw new Error(
          `WDA returned invalid bounds for ${accessibilityId}: ${JSON.stringify(rect)}`,
        );
      }
      return { elementId, rect, source: lastSource };
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Safari ${elementType} named ${accessibilityId}. Last error: ${String(lastError)}. Last source saved to ${sourceFile} (${lastSource.length} bytes)`,
  );
}

async function waitForSubmittedValue(
  submittedValue: () => string | undefined,
): Promise<string | undefined> {
  const deadline = Date.now() + TARGET_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = submittedValue();
    if (value !== undefined) {
      return value;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return submittedValue();
}

describe.skipIf(!RUN_LIVE_SMOKE)('iOS Simulator live smoke', () => {
  it('drives Safari through WDA without calling a model and emits evidence', async () => {
    const diagnosticsEnv = process.env.MIDSCENE_IOS_DIAGNOSTICS_DIR;
    if (!diagnosticsEnv) {
      throw new Error(
        'MIDSCENE_IOS_DIAGNOSTICS_DIR is required for the iOS Simulator smoke',
      );
    }

    const diagnosticsDir = path.resolve(diagnosticsEnv);
    const sourceFile = path.join(diagnosticsDir, 'safari-source.xml');
    const postInputSourceFile = path.join(
      diagnosticsDir,
      'safari-after-input-source.xml',
    );
    const screenshotFile = path.join(diagnosticsDir, 'safari-smoke.png');
    const postInputScreenshotFile = path.join(
      diagnosticsDir,
      'safari-after-input.png',
    );
    const dumpFile = path.join(diagnosticsDir, 'agent-dump.json');
    const evidenceFile = path.join(diagnosticsDir, 'evidence.json');
    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', REPORT_HTML_FILE_NAME);
    const evidence: Record<string, unknown> = {
      platform: process.platform,
      diagnosticsDir,
      reportFile,
    };

    let agent: IOSAgent | undefined;
    let fixture: Awaited<ReturnType<typeof startFixtureServer>> | undefined;
    await mkdir(diagnosticsDir, { recursive: true });
    await rm(reportFile, { force: true });

    try {
      fixture = await startFixtureServer();
      evidence.fixtureUrl = fixture.url;
      agent = await agentFromWebDriverAgent({
        wdaHost: '127.0.0.1',
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'ios-ci-model-must-not-run',
          [MIDSCENE_MODEL_API_KEY]: 'ios-ci-unused-key',
          [MIDSCENE_MODEL_BASE_URL]: 'http://127.0.0.1:1/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
          [MIDSCENE_MODEL_TIMEOUT]: '1000',
          [MIDSCENE_MODEL_RETRY_COUNT]: '0',
        },
        groupName: 'iOS Simulator live smoke',
        groupDescription:
          'Deterministic Safari input and screenshot validation on GitHub Actions',
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        generateReport: true,
        waitAfterAction: 200,
      });

      await agent.launch(fixture.url);
      const target = await waitForElementRect(
        agent,
        sourceFile,
        INPUT_ACCESSIBILITY_ID,
        'XCUIElementTypeTextField',
      );
      evidence.target = target;

      const screenSize = await agent.interface.getScreenSize();
      const screenshot = await agent.interface.screenshotBase64();
      const screenshotSize = await imageInfoOfBase64(screenshot);
      await writeFile(screenshotFile, screenshotBuffer(screenshot));
      evidence.screen = { screenSize, screenshotSize };
      expect(screenSize.width).toBeGreaterThan(0);
      expect(screenSize.height).toBeGreaterThan(0);
      expect(screenSize.scale).toBeGreaterThanOrEqual(1);
      expect(screenshotSize.width).toBe(
        Math.round(screenSize.width * screenSize.scale),
      );
      expect(screenshotSize.height).toBe(
        Math.round(screenSize.height * screenSize.scale),
      );

      const targetLocate = locate(
        target.rect,
        screenSize.scale,
        INPUT_ACCESSIBILITY_ID,
      );
      await agent.callActionInActionSpace('Tap', { locate: targetLocate });
      await agent.callActionInActionSpace('Input', {
        value: SUBMITTED_TEXT,
        mode: 'typeOnly',
        autoDismissKeyboard: false,
        locate: targetLocate,
      });
      await agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Enter',
        locate: targetLocate,
      });

      const postInputSourceResponse = (await agent.runWdaRequest({
        method: 'GET',
        endpoint: '/source',
      })) as WdaValueResponse<string>;
      await writeFile(
        postInputSourceFile,
        postInputSourceResponse.value,
        'utf8',
      );
      const postInputNode = (
        postInputSourceResponse.value.match(
          /<XCUIElementTypeTextField\b[^>]*>/g,
        ) ?? []
      ).find(
        (nodeTag) => xmlAttribute(nodeTag, 'name') === INPUT_ACCESSIBILITY_ID,
      );
      const inputText = postInputNode
        ? xmlAttribute(postInputNode, 'value')
        : undefined;
      evidence.inputText = inputText;
      expect(inputText).toBe(SUBMITTED_TEXT);
      await agent.interface
        .screenshotBase64()
        .then((base64) =>
          writeFile(postInputScreenshotFile, screenshotBuffer(base64)),
        );

      const submittedValue = await waitForSubmittedValue(
        fixture.submittedValue,
      );
      evidence.submittedValue = submittedValue;
      expect(submittedValue).toBe(SUBMITTED_TEXT);

      const dump = JSON.parse(agent.dumpDataString()) as ReportDump;
      await writeFile(dumpFile, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
      const dumpTasks = (dump.executions ?? []).flatMap(
        (execution) => execution.tasks ?? [],
      );
      const locateTasks = dumpTasks.filter(
        (task) => task.type === 'Planning' && task.subType === 'Locate',
      );
      expect(locateTasks).toHaveLength(3);
      expect(locateTasks.every((task) => task.hitBy?.from === 'Plan')).toBe(
        true,
      );
      expect(agent.metrics.calls).toBe(0);
      expect(
        dumpTasks.some(
          (task) =>
            task.timing?.callAiStart !== undefined ||
            task.timing?.callAiEnd !== undefined ||
            task.usage !== undefined ||
            task.searchAreaUsage !== undefined,
        ),
      ).toBe(false);

      await agent.destroy();
      expect(agent.reportFile).toBe(reportFile);
      const reportHtml = await readFile(reportFile, 'utf8');
      expect(reportHtml).not.toContain('REPLACE_ME_WITH_REPORT_HTML');
      const reportTasks = latestExecutions(
        parseReportDumps(reportHtml),
      ).flatMap((execution) => execution.tasks ?? []);
      const reportLocateTasks = reportTasks.filter(
        (task) => task.type === 'Planning' && task.subType === 'Locate',
      );
      expect(reportLocateTasks).toHaveLength(3);
      expect(
        reportLocateTasks.every((task) => task.hitBy?.from === 'Plan'),
      ).toBe(true);
      for (const action of ['Tap', 'Input', 'KeyboardPress']) {
        expect(
          reportTasks.some(
            (task) => task.type === 'Action Space' && task.subType === action,
          ),
        ).toBe(true);
      }
      evidence.report = {
        path: reportFile,
        modelCalls: agent.metrics.calls,
        locateHitSources: reportLocateTasks.map((task) => task.hitBy?.from),
      };
    } catch (error) {
      evidence.error =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error);
      throw error;
    } finally {
      if (agent) {
        await agent.destroy().catch((error) => {
          evidence.agentDestroyError = String(error);
        });
      }
      if (fixture) {
        await closeServer(fixture.server).catch((error) => {
          evidence.fixtureServerCloseError = String(error);
        });
      }
      await writeFile(
        evidenceFile,
        `${JSON.stringify(evidence, null, 2)}\n`,
        'utf8',
      );
    }
  });
});
