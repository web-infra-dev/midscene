import * as fsActual from 'node:fs' with { rstest: 'importActual' };
import * as fs from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as agentActual from '@midscene/core/agent' with {
  rstest: 'importActual',
};
import { parseDumpScript, parseImageScripts } from '@midscene/core/dump';
import { setMidsceneRunDir } from '@midscene/shared/common';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from '@rstest/core';
import { PlaygroundServer } from '../../src/server';
import type { PlaygroundReportRef } from '../../src/types';

function createResponse() {
  return {
    body: undefined as any,
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
    json(body: unknown) {
      return this.send(body);
    },
    setHeader: rs.fn(),
    type(_value: string) {
      return this;
    },
    sendFile(path: string) {
      this.body = path;
      return this;
    },
  };
}

function route(server: PlaygroundServer, method: 'get' | 'post', path: string) {
  const calls = rs.mocked(server.app[method]).mock.calls;
  return calls.find(
    ([registeredPath]) => registeredPath === path,
  )![1] as unknown as (
    req: any,
    res: ReturnType<typeof createResponse>,
  ) => Promise<void>;
}

describe('PlaygroundServer independent persisted reports', () => {
  let directory: string;
  let server: PlaygroundServer;
  let agent: InstanceType<typeof agentActual.Agent>;
  let destroyDevice: ReturnType<typeof rs.fn>;

  beforeEach(async () => {
    // The shared setup mocks filesystem helpers before loading Core. Restore
    // their implementations so both Core and the server exercise real I/O.
    for (const method of [
      'existsSync',
      'mkdirSync',
      'readFileSync',
      'createReadStream',
    ] as const) {
      rs.mocked(fs[method]).mockImplementation(fsActual[method] as any);
    }
    directory = await mkdtemp(join(tmpdir(), 'midscene-server-reports-'));
    setMidsceneRunDir(directory);
    destroyDevice = rs.fn(async () => {});
    agent = new agentActual.Agent(
      {
        interfaceType: 'puppeteer',
        actionSpace: () => [],
        destroy: destroyDevice,
      } as any,
      {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'test-model',
          [MIDSCENE_MODEL_API_KEY]: 'test-key',
          [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
        },
        autoPrintReportMsg: false,
      },
    );
    server = new PlaygroundServer(agent);
    await server.launch(6150);
  });

  afterEach(async () => {
    await server?.close();
    setMidsceneRunDir(undefined);
    await rm(directory, { recursive: true, force: true });
  });

  async function execute(requestId: string) {
    const response = createResponse();
    await route(
      server,
      'post',
      '/execute',
    )({ body: { type: 'aiAct', prompt: 'same prompt', requestId } }, response);
    expect(response.statusCode).toBe(200);
    return response.body as {
      report: PlaygroundReportRef | null;
      error: string | null;
    };
  }

  async function downloadedReport(report: PlaygroundReportRef) {
    const response = createResponse();
    await route(
      server,
      'get',
      '/reports/:reportId/',
    )({ params: { reportId: report.id } }, response);
    expect(response.statusCode).toBe(200);
    return readFile(response.body as string, 'utf8');
  }

  test('three executions retain their own downloads, replay data and screenshots', async () => {
    server.setPreparedPlatform({
      platformId: 'web',
      title: 'Web',
      description: 'Web',
      preview: { kind: 'none' },
      executionHooks: {
        beforeExecute: async () => {
          await agent.recordToReport('before execution', {
            screenshotBase64: 'AAAA',
          });
        },
        afterExecute: async () => {
          await agent.recordToReport('after execution', {
            screenshotBase64: 'AQ==',
          });
        },
      },
    });
    const aiAct = rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      await agent.recordToReport('same prompt', {
        screenshotBase64: `data:image/png;base64,${Buffer.from(agent.reportFileName!).toString('base64')}`,
      });
      return 'done';
    });
    const reports: Array<{ ref: PlaygroundReportRef; html: string }> = [];

    for (let run = 0; run < 3; run++) {
      const result = await execute(`run-${run}`);
      expect(result.error).toBeNull();
      expect(result.report).not.toBeNull();
      const html = await downloadedReport(result.report!);
      const dump = JSON.parse(parseDumpScript(html));
      expect(
        dump.executions.map((execution: { name: string }) => execution.name),
      ).toEqual([
        'Log - before execution',
        'Log - same prompt',
        'Log - after execution',
      ]);
      // Built viewer scripts also contain image-tag source strings. Only
      // valid image reference IDs represent actual persisted screenshots.
      expect(
        Object.keys(parseImageScripts(html)).filter((id) =>
          /^[a-z0-9_-]+$/i.test(id),
        ),
      ).toHaveLength(3);
      reports.push({ ref: result.report!, html });

      for (const report of reports) {
        expect(await downloadedReport(report.ref)).toBe(report.html);
        const replay = createResponse();
        await route(
          server,
          'get',
          '/reports/:reportId/replay',
        )({ params: { reportId: report.ref.id } }, replay);
        expect(replay.statusCode).toBe(200);
        expect(JSON.parse(replay.body)).toEqual(
          JSON.parse(parseDumpScript(report.html)),
        );
      }
    }

    expect(aiAct).toHaveBeenCalledTimes(3);
    expect(destroyDevice).not.toHaveBeenCalled();
    expect(
      new Set(
        reports.map(
          ({ html }) => JSON.parse(parseDumpScript(html)).executions[0].id,
        ),
      ).size,
    ).toBe(3);
  });

  test('a failed run keeps its partial report and a following empty failure has no stale report', async () => {
    const aiAct = rs.spyOn(agent, 'aiAct');
    aiAct.mockImplementationOnce(async () => {
      await agent.recordToReport('failed run', { screenshotBase64: 'AAAA' });
      throw new Error('action failed');
    });
    const failed = await execute('failed-run');
    expect(failed.error).toBe('action failed');
    expect(failed.report).not.toBeNull();
    const failedHtml = await downloadedReport(failed.report!);

    aiAct.mockRejectedValueOnce(new Error('failed before recording'));
    const empty = await execute('empty-run');
    expect(empty.error).toBe('failed before recording');
    expect(empty.report).toBeNull();
    expect(await downloadedReport(failed.report!)).toBe(failedHtml);

    aiAct.mockImplementationOnce(async () => {
      await agent.recordToReport('recovered run', { screenshotBase64: 'AQ==' });
      return 'done';
    });
    const recovered = await execute('recovered-run');
    const recoveredHtml = await downloadedReport(recovered.report!);
    expect(recoveredHtml).not.toContain('failed run');
    expect(await downloadedReport(failed.report!)).toBe(failedHtml);
  });

  test('cancellation publishes only the cancelled run and preserves an earlier download', async () => {
    const aiAct = rs.spyOn(agent, 'aiAct');
    aiAct.mockImplementationOnce(async () => {
      await agent.recordToReport('completed run', { screenshotBase64: 'AAAA' });
      return 'done';
    });
    const first = await execute('completed-run');
    const firstHtml = await downloadedReport(first.report!);
    let started!: () => void;
    const actionStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    aiAct.mockImplementationOnce(async (_prompt, options) => {
      await agent.recordToReport('cancelled run', { screenshotBase64: 'AQ==' });
      started();
      await new Promise<void>((resolve) => {
        options?.abortSignal?.addEventListener('abort', () => resolve(), {
          once: true,
        });
      });
      return 'cancelled';
    });
    const executing = execute('cancelled-run');
    await actionStarted;
    const cancel = createResponse();
    await route(
      server,
      'post',
      '/cancel/:requestId',
    )({ params: { requestId: 'cancelled-run' } }, cancel);
    await executing;

    expect(cancel.body.status).toBe('cancelled');
    const html = await downloadedReport(cancel.body.report);
    const dump = JSON.parse(parseDumpScript(html));
    expect(dump.executions).toHaveLength(1);
    expect(dump.executions[0].name).toBe('Log - cancelled run');
    expect(await downloadedReport(first.report!)).toBe(firstHtml);
  });

  test('report setup and finalization failures are surfaced without reusing an older report', async () => {
    const aiAct = rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      await agent.recordToReport('recorded run', { screenshotBase64: 'AAAA' });
      return 'done';
    });
    const first = await execute('first-run');
    const firstHtml = await downloadedReport(first.report!);
    rs.spyOn(agent, '_startNewReport').mockRejectedValueOnce(
      new Error('report setup failed'),
    );
    const setupFailure = await execute('setup-failure');
    expect(setupFailure).toMatchObject({
      error: 'report setup failed',
      report: null,
    });
    expect(aiAct).toHaveBeenCalledOnce();

    // Inject below Agent._finalizeReport so its real cached failure is tested.
    aiAct.mockImplementationOnce(async () => {
      await agent.recordToReport('failed finalization', {
        screenshotBase64: 'AQ==',
      });
      rs.spyOn(
        (agent as any).reportGenerator,
        'finalize',
      ).mockRejectedValueOnce(new Error('report finalization failed'));
      return 'done';
    });
    const finalizationFailure = await execute('finalization-failure');
    expect(finalizationFailure).toMatchObject({
      error: 'report finalization failed',
      report: null,
    });
    expect(await downloadedReport(first.report!)).toBe(firstHtml);
    for (let run = 0; run < 2; run++) {
      const recovered = await execute(`recovered-${run}`);
      expect(recovered.error).toBeNull();
      const html = await downloadedReport(recovered.report!);
      expect(JSON.parse(parseDumpScript(html)).executions).toHaveLength(1);
      expect(html).not.toContain('failed finalization');
      expect(await downloadedReport(first.report!)).toBe(firstHtml);
    }
  });
});
