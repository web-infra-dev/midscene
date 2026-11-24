import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { commonAgentTestRunnerNodeDefinitions as definitions } from '@midscene/core/agent/test';
import { FatalDeviceError } from '@midscene/core/internal/test-runner';
import { afterAll, describe, expect, it, rs } from '@rstest/core';
import {
  type ReplayEvent,
  executeWithReplay,
  withReplayExecution,
} from '../src/midscene/replay';

const root = mkdtempSync(join(tmpdir(), 'replay-nodes-'));
mkdirSync(join(root, 'node_modules/@midscene'), { recursive: true });
symlinkSync(
  resolve(__dirname, '../../replay'),
  join(root, 'node_modules/@midscene/replay'),
);
let count = 0;
const moduleFile = (body: string) => {
  const file = `step-${count++}.mjs`;
  writeFileSync(join(root, file), body);
  return `./${file}`;
};
afterAll(() => rmSync(root, { recursive: true, force: true }));
const context = (
  input: Record<string, unknown>,
  signal = new AbortController().signal,
  index = 0,
) => ({
  input,
  signal,
  scope: 'case' as const,
  case: {
    sourcePath: join(root, 'case.yaml'),
    runId: 'run-one',
    caseId: 'case-one',
    projectName: 'test',
    name: 'case',
    caseIndex: 0,
    attemptIndex: 0,
    phase: 'steps' as const,
    stepIndex: index,
  },
  $: {},
  context: {},
  onTeardown() {},
  report: { addTrace() {}, onSnapshot() {} },
});
const definition = (name: string) => definitions.find((d) => d.name === name)!;

describe('native AI script implementations', () => {
  it('runs ready/run/done, reuses input and params, and returns native aiQuery data', async () => {
    const replay = moduleFile(
      `export default {ready(rp,{agent}){agent.order.push('ready')},run(rp,{agent,input,params}){agent.order.push('run'); return {value:params.id,prompt:input.prompt,hasReplay:'replay' in input}},done(rp,{agent}){agent.order.push('done')}}`,
    );
    const agent = {
      order: [] as string[],
      aiQuery: rs.fn(),
      recordToReport: rs.fn(),
    };
    const result = await executeWithReplay(
      definition('aiQuery'),
      agent,
      context({
        prompt: 'orders',
        replay: { script: replay, params: { id: 'B' } },
      }) as any,
    );
    expect(result).toEqual({
      data: { value: 'B', prompt: 'orders', hasReplay: false },
    });
    expect(agent.order).toEqual(['ready', 'run', 'done']);
    expect(agent.aiQuery).not.toHaveBeenCalled();
  });
  it.each(['ready', 'run', 'done'])(
    'auto hands a %s failure to the original native node and retains options',
    async (phase) => {
      const replay = moduleFile(
        `export default {${phase}(){throw new Error('script failure')},${phase === 'run' ? '' : 'run(){return "script"}'}}`,
      );
      const agent = {
        aiAct: rs.fn(async () => 'native'),
        recordToReport: rs.fn(),
      };
      const ctx = context({
        prompt: 'approve B',
        options: { cacheable: false, context: 'original' },
        replay,
      });
      expect(
        await executeWithReplay(definition('aiAct'), agent, ctx as any),
      ).toEqual({ summary: 'native' });
      expect(agent.aiAct).toHaveBeenCalledWith('approve B', {
        cacheable: false,
        context: 'original',
        abortSignal: ctx.signal,
      });
      expect(agent.recordToReport.mock.calls[0][0]).toContain('→ native');
    },
  );
  it('keeps the original native input when a script mutates its input before failing', async () => {
    const replay = moduleFile(
      "export default {run(rp,{input}){input.prompt='changed';input.options.context='changed';throw new Error('failed')}}",
    );
    const agent = {
      aiAct: rs.fn(async () => 'native'),
      recordToReport: rs.fn(),
    };
    const ctx = context({
      prompt: 'original',
      options: { context: 'original context' },
      replay,
    });
    await executeWithReplay(definition('aiAct'), agent, ctx as any);
    expect(agent.aiAct).toHaveBeenCalledWith('original', {
      context: 'original context',
      abortSignal: ctx.signal,
    });
    expect(ctx.input.options).toEqual({ context: 'original context' });
  });
  it('strict fails without native fallback; off does not even import the script', async () => {
    const agent = {
      aiAct: rs.fn(async () => 'native'),
      recordToReport: rs.fn(),
    };
    const ctx = context({ prompt: 'x', replay: './missing.mjs' });
    await expect(
      withReplayExecution({ replay: 'strict' }, () =>
        executeWithReplay(definition('aiAct'), agent, ctx as any),
      ),
    ).rejects.toThrow();
    expect(agent.aiAct).not.toHaveBeenCalled();
    expect(
      await withReplayExecution({ replay: 'off' }, () =>
        executeWithReplay(definition('aiAct'), agent, ctx as any),
      ),
    ).toEqual({ summary: 'native' });
  });
  it('preserves native failure after an unsuccessful script', async () => {
    const failure = new Error('native failed');
    const agent = {
      aiAct: rs.fn(async () => {
        throw failure;
      }),
      recordToReport: rs.fn(),
    };
    await expect(
      executeWithReplay(
        definition('aiAct'),
        agent,
        context({ prompt: 'x', replay: './missing.mjs' }) as any,
      ),
    ).rejects.toBe(failure);
  });
  it('false assertion results fail with the native message; invalid scalar outputs do not silently pass', async () => {
    const replay = moduleFile(
      `export default {run(){return {pass:false,thought:'wrong page'}}}`,
    );
    const agent = { aiAssert: rs.fn(), recordToReport: rs.fn() };
    await expect(
      withReplayExecution({ replay: 'strict' }, () =>
        executeWithReplay(
          definition('aiAssert'),
          agent,
          context({
            prompt: 'good page',
            message: 'business failure',
            replay,
          }) as any,
        ),
      ),
    ).rejects.toThrow('business failure');
    expect(() => definition('aiNumber').replayResult!('3', {})).toThrow();
    expect(() => definition('aiAssert').replayResult!(false, {})).toThrow();
    expect(definition('aiBoolean').replayResult!(false, {})).toMatchObject({
      data: { value: false },
    });
  });
  it('does not fall back after cancellation and keeps occurrences distinct', async () => {
    const replay = moduleFile(
      `export default {run(rp,{agent}) {agent.abort?.();return 'ok'}}`,
    );
    const controller = new AbortController();
    const agent = {
      abort: () => controller.abort(new Error('stop')),
      aiAct: rs.fn(),
      recordToReport: rs.fn(),
    };
    await expect(
      executeWithReplay(
        definition('aiAct'),
        agent,
        context({ prompt: 'x', replay }, controller.signal) as any,
      ),
    ).rejects.toThrow('stop');
    expect(agent.aiAct).not.toHaveBeenCalled();
    const events: ReplayEvent[] = [];
    await withReplayExecution(
      { onReplayEvent: (e) => events.push(e) },
      async () => {
        for (const i of [0, 1])
          await executeWithReplay(
            definition('aiAct'),
            { recordToReport: rs.fn() },
            context({ prompt: 'x', replay }, undefined, i) as any,
          );
      },
    );
    expect(new Set(events.map((e) => e.stepIndex))).toEqual(new Set([0, 1]));
  });
  it('keeps fatal native device failures terminal and honors aiWaitFor options', async () => {
    const replay = moduleFile(
      'export default {run(rp,{agent}){throw agent.failure}}',
    );
    const failure = new FatalDeviceError('device disconnected');
    const agent = { failure, aiAct: rs.fn(), recordToReport: rs.fn() };
    await expect(
      executeWithReplay(
        definition('aiAct'),
        agent,
        context({ prompt: 'x', replay }) as any,
      ),
    ).rejects.toBe(failure);
    expect(agent.aiAct).not.toHaveBeenCalled();
    const waiting = moduleFile(`export default {run:rp=>rp.waitFor('false')}`);
    const polling = {
      evaluateJavaScript: rs.fn(async () => false),
      recordToReport: rs.fn(),
      aiWaitFor: rs.fn(),
    };
    await expect(
      withReplayExecution({ replay: 'strict' }, () =>
        executeWithReplay(
          definition('aiWaitFor'),
          polling,
          context({
            prompt: 'x',
            options: { timeoutMs: 30, checkIntervalMs: 20 },
            replay: waiting,
          }) as any,
        ),
      ),
    ).rejects.toThrow('WAIT_TIMEOUT');
    expect(polling.evaluateJavaScript.mock.calls.length).toBeGreaterThan(1);
    expect(polling.evaluateJavaScript.mock.calls.length).toBeLessThanOrEqual(4);
    expect(polling.aiWaitFor).not.toHaveBeenCalled();
  });
  it('legacy/core execution explicitly rejects replay and non-AI nodes do not advertise it', async () => {
    await expect(
      definition('aiAct').execute(
        { aiAct: rs.fn() },
        { prompt: 'x', replay: './x.mjs' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('requires @midscene/test');
    for (const node of definitions.filter(
      (d) => d.name.startsWith('ai') || d.name === 'runGherkinScenario',
    ))
      expect(node.inputSchema.shape.replay).toBeDefined();
    expect(definition('javascript').inputSchema.shape.replay).toBeUndefined();
  });
});
