import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { ElementCacheFeature } from '@midscene/core';
import { TaskCache } from '@midscene/core/agent';
import type { UiNode } from '@midscene/core/device-cache';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ComputerAgent } from '../../src/agent';
import { ComputerDevice } from '../../src/device';
import { readLinuxAccessibilityTree } from '../../src/linux-accessibility-tree';

const RUN_SMOKE =
  process.platform === 'linux' &&
  process.env.MIDSCENE_LINUX_ACCESSIBILITY_CACHE_SMOKE === '1';
const TARGET_NAME = 'Midscene Cache Target';
const TARGET_ID = 'cache_target_button';
const CACHE_PROMPT = `the button labeled "${TARGET_NAME}"`;
const REPORT_FILE_NAME = 'linux-accessibility-cache-hit-report';
const FIXTURE_PATH = resolve(
  __dirname,
  'fixtures/linux-accessibility-cache-app.py',
);

vi.setConfig({ testTimeout: 120_000, hookTimeout: 30_000 });

let fixtureProcess: ChildProcess | undefined;
let fixtureOutput = '';

function firstXpath(feature: ElementCacheFeature): string {
  if (!Array.isArray(feature.xpaths) || typeof feature.xpaths[0] !== 'string') {
    throw new Error('Linux cache smoke did not generate an xpath feature');
  }
  return feature.xpaths[0];
}

function findNode(
  node: UiNode,
  predicate: (candidate: UiNode) => boolean,
): UiNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return undefined;
}

async function waitForTargetNode(): Promise<UiNode> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (fixtureProcess?.exitCode !== null) {
      throw new Error(
        `Linux accessibility fixture exited early (${fixtureProcess?.exitCode}). Output:\n${fixtureOutput}`,
      );
    }
    try {
      const root = await readLinuxAccessibilityTree();
      const target = findNode(
        root,
        (node) =>
          node.attrs.AccessibleId === TARGET_ID ||
          node.attrs.Name === TARGET_NAME,
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(
    `Timed out waiting for GTK target in AT-SPI tree. Last error: ${lastError}. Fixture output:\n${fixtureOutput}`,
  );
}

function startFixture(): void {
  fixtureProcess = spawn('python3', [FIXTURE_PATH], {
    env: {
      ...process.env,
      NO_AT_BRIDGE: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  fixtureProcess.stdout?.on('data', (chunk: Buffer) => {
    fixtureOutput += chunk.toString('utf8');
  });
  fixtureProcess.stderr?.on('data', (chunk: Buffer) => {
    fixtureOutput += chunk.toString('utf8');
  });
}

afterAll(() => {
  if (fixtureProcess?.exitCode === null) {
    fixtureProcess.kill('SIGTERM');
  }
});

describe.runIf(RUN_SMOKE)('Linux AT-SPI xpath cache smoke', () => {
  it('generates a Midscene report containing a real cache-hit locate', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'midscene-linux-cache-'));
    const cacheId = `linux-accessibility-${process.pid}`;
    const device = new ComputerDevice({ headless: false });
    let agent: ComputerAgent<ComputerDevice> | undefined;

    try {
      await device.connect();
      startFixture();
      const target = await waitForTargetNode();
      expect(target.bounds.width).toBeGreaterThan(0);
      expect(target.bounds.height).toBeGreaterThan(0);

      const center: [number, number] = [
        Math.round(target.bounds.left + target.bounds.width / 2),
        Math.round(target.bounds.top + target.bounds.height / 2),
      ];
      const feature = await device.cacheFeatureForPoint(center);
      const xpath = firstXpath(feature);
      expect(feature.target).toMatchObject({
        type: 'ATSPIPushButton',
        value: expect.any(String),
      });

      const cache = new TaskCache(cacheId, false, undefined, {
        writeOnly: true,
        cacheDir,
      });
      cache.appendCache({
        type: 'locate',
        prompt: CACHE_PROMPT,
        cache: feature,
      });

      agent = new ComputerAgent(device, {
        cache: { id: cacheId, strategy: 'read-only', cacheDir },
        reportFileName: REPORT_FILE_NAME,
        autoPrintReportMsg: false,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'cache-smoke-must-not-call-model',
          MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
          MIDSCENE_MODEL_API_KEY: 'unused',
          MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1/v1',
        },
      });

      await agent.aiLocate(CACHE_PROMPT);
      const dump = JSON.parse(agent.dumpDataString()) as {
        executions: Array<{
          tasks: Array<{ hitBy?: { from?: string } }>;
        }>;
      };
      const cacheHits = dump.executions.flatMap((execution) =>
        execution.tasks.filter((task) => task.hitBy?.from === 'Cache'),
      );
      expect(cacheHits).toHaveLength(1);

      await agent.destroy();
      const reportFile = agent.reportFile;
      expect(reportFile).toBeTruthy();
      expect(basename(reportFile!)).toBe(`${REPORT_FILE_NAME}.html`);
      expect(existsSync(reportFile!)).toBe(true);
      expect(readFileSync(reportFile!, 'utf8')).toContain('"from":"Cache"');

      console.log(
        '[LinuxCacheSmoke] hit',
        JSON.stringify({
          xpath,
          target: feature.target,
          bounds: target.bounds,
          reportFile,
        }),
      );
    } finally {
      if (agent) {
        await agent.destroy();
      } else {
        await device.destroy();
      }
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
