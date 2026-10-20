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
import { LocalExecutionAdapter } from '../../src/adapters/local-execution';
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
    rs.spyOn(agent, 'resetDump').mockRejectedValueOnce(
      new Error('report setup failed'),
    );
    const setupFailure = await execute('setup-failure');
    expect(setupFailure).toMatchObject({
      error: 'report setup failed',
      report: null,
    });
    expect(aiAct).toHaveBeenCalledOnce();

    // Inject below Agent.finalizeReport so its real cached failure is tested.
    aiAct.mockImplementationOnce(async () => {
      await agent.recordToReport('failed finalization', {
        screenshotBase64: 'AQ==',
      });
      rs.spyOn(
        (agent as any).reportManager.reportState.generator,
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

  test('local execution reuses the Agent and captures each export before releasing records', async () => {
    rs.spyOn(agent, 'aiAct').mockImplementation(async (prompt) => {
      await agent.recordToReport(String(prompt), { screenshotBase64: 'AAAA' });
      return 'done';
    });
    const adapter = new LocalExecutionAdapter(agent);
    const files: Array<{ path: string; html: string }> = [];
    for (const prompt of ['local first', 'local second']) {
      const result = (await adapter.executeAction(
        'aiAct',
        { type: 'aiAct', prompt },
        {},
      )) as any;
      expect(result.error).toBeNull();
      expect(
        result.dump.executions.map((entry: { name: string }) => entry.name),
      ).toEqual([`Log - ${prompt}`]);
      expect(result.reportHTML).toContain(prompt);
      expect(agent.dump.executions).toEqual([]);
      const path = agent.reportFile!;
      const html = await readFile(path, 'utf8');
      files.push({ path, html });
      for (const file of files)
        expect(await readFile(file.path, 'utf8')).toBe(file.html);
    }
    expect(files[0].path).not.toBe(files[1].path);
    expect(destroyDevice).not.toHaveBeenCalled();
  });

  test('local cancellation aborts unfinished work before finalizing its report', async () => {
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    rs.spyOn(agent, 'aiAct').mockImplementation(async (_prompt, options) => {
      await agent.recordToReport('local cancelled run', {
        screenshotBase64: 'AAAA',
      });
      started();
      await new Promise<void>((resolve) => {
        options?.abortSignal?.addEventListener('abort', () => resolve(), {
          once: true,
        });
      });
      options?.abortSignal?.throwIfAborted();
      return 'done';
    });
    const adapter = new LocalExecutionAdapter(agent);
    const execution = adapter.executeAction(
      'aiAct',
      { type: 'aiAct', prompt: 'cancel' },
      { requestId: 'local-cancel' },
    );
    await running;
    await expect(
      adapter.executeAction('aiAct', { type: 'aiAct' }, {}),
    ).rejects.toThrow('Another task is already running');
    const cancelled = await adapter.cancelTask('local-cancel');
    const result = (await execution) as any;
    expect(cancelled.success).toBe(true);
    expect((cancelled.dump as any).executions[0].name).toBe(
      'Log - local cancelled run',
    );
    expect(result.error).toContain('cancelled');
    expect(destroyDevice).toHaveBeenCalledOnce();
    expect(
      JSON.parse(parseDumpScript(await readFile(agent.reportFile!, 'utf8')))
        .executions,
    ).toHaveLength(1);
  });

  test('requests without a caller id still acquire an exclusive report execution', async () => {
    let started!: () => void;
    let release!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      await agent.recordToReport('generated id run', {
        screenshotBase64: 'AAAA',
      });
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 'done';
    });
    const first = createResponse();
    const executing = route(
      server,
      'post',
      '/execute',
    )({ body: { type: 'aiAct' } }, first);
    await running;
    const second = createResponse();
    try {
      await route(
        server,
        'post',
        '/execute',
      )({ body: { type: 'aiAct' } }, second);
      expect(second.statusCode).toBe(409);
    } finally {
      release();
      await executing;
    }
    expect(first.body.requestId).toBeTruthy();
    expect(first.body.error).toBeNull();
  });

  test('cancellation during report finalization returns the same sealed artifact', async () => {
    let started!: () => void;
    let release!: () => void;
    const finalizing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    rs.spyOn(agent, 'aiAct').mockImplementation(async () => {
      await agent.recordToReport('closing run', { screenshotBase64: 'AAAA' });
      const generator = (agent as any).reportManager.reportState.generator;
      const finalize = generator.finalize.bind(generator);
      rs.spyOn(generator, 'finalize').mockImplementation(async () => {
        started();
        await pending;
        return finalize();
      });
      return 'done';
    });
    const executing = execute('closing-run');
    await finalizing;
    const cancel = createResponse();
    const cancellation = route(
      server,
      'post',
      '/cancel/:requestId',
    )({ params: { requestId: 'closing-run' } }, cancel);
    release();
    const [result] = await Promise.all([executing, cancellation]);
    expect(cancel.statusCode).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
    expect(cancel.body.report).not.toBeNull();
    const cancelledHtml = await downloadedReport(cancel.body.report);
    expect(await downloadedReport(result.report!)).toBe(cancelledHtml);
    expect(JSON.parse(parseDumpScript(cancelledHtml)).executions).toHaveLength(
      1,
    );
  });
});
