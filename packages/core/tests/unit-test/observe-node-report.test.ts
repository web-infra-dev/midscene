import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent';
import { commonAgentTestRunnerNodeDefinitions } from '@/agent/test-runner-nodes';
import type { UIObservationImpl } from '@/agent/ui-observer';
import type { AbstractInterface } from '@/device';
import { setMidsceneRunDir } from '@midscene/shared/common';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, expect, rs, test } from '@rstest/core';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mP4HKzauIeNgXXZh/+7OAApSwYLCdgqFgAAAABJRU5ErkJggg==';
let agent: Agent;
let directory: string;
afterEach(async () => {
  await agent?.destroy();
  rs.restoreAllMocks();
  setMidsceneRunDir(undefined);
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const mode of [
  'disabled',
  'single-html',
  'html-and-external-assets',
] as const) {
  test.each([true, false])(
    `exports observation screenshots after disposal with ${mode}, pass=%s`,
    async (pass) => {
      directory = await mkdtemp(join(tmpdir(), 'observe-report-'));
      setMidsceneRunDir(directory);
      agent = new Agent(
        {
          interfaceType: 'puppeteer',
          actionSpace: () => [],
          screenshotBase64: async () => png,
          size: async () => ({ width: 2, height: 2 }),
        } as AbstractInterface,
        {
          generateReport: mode !== 'disabled',
          outputFormat: mode === 'disabled' ? 'single-html' : mode,
          autoPrintReportMsg: false,
          modelConfig: {
            [MIDSCENE_MODEL_NAME]: 'test-model',
            [MIDSCENE_MODEL_API_KEY]: 'test-key',
            [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
          },
        },
      );
      // Only device actions and model inference are stubbed. Observer, task
      // recording, report generation, serialization and disposal remain real.
      rs.spyOn(agent, 'aiAct').mockResolvedValue(undefined as never);
      rs.spyOn(agent.service, 'extract').mockResolvedValue({
        data: { StatementIsTruthy: pass },
        thought: 'recorded sequence',
        dump: {
          logTime: Date.now(),
          type: 'extract',
          logId: 'test',
          userQuery: {},
          data: {},
          taskInfo: {},
        },
      } as never);
      const files: string[] = [];
      const start = agent.startObserving.bind(agent);
      rs.spyOn(agent, 'startObserving').mockImplementation(async (options) => {
        const observer = await start({ ...options, intervalMs: 200 });
        const stop = observer.stop.bind(observer);
        rs.spyOn(observer, 'stop').mockImplementation(async () => {
          const observation = await stop();
          const record = await (
            observation as UIObservationImpl
          ).exportRecord();
          files.push(...record.frames.map((frame) => frame.path));
          return observation;
        });
        return observer;
      });
      const node = commonAgentTestRunnerNodeDefinitions.find(
        (item) => item.name === 'observe',
      )!;
      const execution = node.execute(
        agent,
        { act: 'submit', assert: 'toast appeared', settleMs: 250 },
        { signal: new AbortController().signal },
      );
      if (pass)
        await expect(execution).resolves.toMatchObject({
          data: { pass: true },
        });
      else
        await expect(execution).rejects.toMatchObject({
          output: { data: { pass: false } },
        });
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.every((file) => !existsSync(file))).toBe(true);
      const screenshots = agent.dump.collectAllScreenshots();
      expect(screenshots.length).toBeGreaterThanOrEqual(2);
      // Includes the last (representative) frame as well as recorder frames.
      for (const screenshot of screenshots) {
        expect(screenshot.base64).toMatch(/^data:image\/(png|jpeg);base64,/);
        expect(
          Buffer.from(screenshot.rawBase64, 'base64').length,
        ).toBeGreaterThan(0);
      }
      expect(() =>
        JSON.parse(agent.dumpDataString({ inlineScreenshots: true })),
      ).not.toThrow();
      if (mode === 'disabled') expect(agent.reportFile).toBeUndefined();
      else expect(screenshots.every((shot) => !shot.hasBase64())).toBe(true);
    },
  );
}
