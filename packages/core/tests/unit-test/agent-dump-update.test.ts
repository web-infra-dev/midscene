import { Agent } from '@/agent';
import { ExecutionDump } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const mockInterface = {
  interfaceType: 'puppeteer',
  actionSpace: () => [],
  screenshotBase64: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
} as any;

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock-model',
  MIDSCENE_MODEL_API_KEY: 'mock-api-key',
  MIDSCENE_MODEL_BASE_URL: 'mock-base-url',
};

function createAgent() {
  return new Agent(mockInterface, {
    generateReport: false,
    autoPrintReportMsg: false,
    modelConfig: mockedModelConfig,
  });
}

function createExecutionDump(name: string) {
  return new ExecutionDump({
    logTime: Date.now(),
    name,
    tasks: [],
  });
}

describe('Agent dump update serialization', () => {
  it('skips dumpDataString during task updates when no dump listener is registered', () => {
    const agent = createAgent();
    const dumpDataStringSpy = vi.spyOn(agent, 'dumpDataString');
    const onTaskUpdate = (agent as any).taskExecutor.hooks.onTaskUpdate;

    onTaskUpdate({
      dump: () => createExecutionDump('no-listener'),
    });

    expect(dumpDataStringSpy).not.toHaveBeenCalled();
  });

  it('uses compact snapshot strings for legacy dump listeners during task updates', () => {
    const agent = createAgent();
    const dumpDataStringSpy = vi.spyOn(agent, 'dumpDataString');
    const listener = vi.fn();
    const onTaskUpdate = (agent as any).taskExecutor.hooks.onTaskUpdate;

    agent.addDumpUpdateListener(listener);

    onTaskUpdate({
      dump: () => createExecutionDump('with-listener'),
    });

    expect(dumpDataStringSpy).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toContain('"name":"with-listener"');
    expect(listener.mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: 'with-listener' }),
    );
  });

  it('skips dumpDataString in recordToReport when no dump listener is registered', async () => {
    const agent = createAgent();
    const dumpDataStringSpy = vi.spyOn(agent, 'dumpDataString');

    await agent.recordToReport('test-log', {
      content: 'test content',
    });

    expect(dumpDataStringSpy).not.toHaveBeenCalled();
  });

  it('emits execution events with compact snapshots during task updates', async () => {
    const agent = createAgent();
    const listener = vi.fn();
    const onTaskUpdate = (agent as any).taskExecutor.hooks.onTaskUpdate;

    agent.addExecutionEventListener(listener);

    onTaskUpdate({
      dump: () => createExecutionDump('event-listener'),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0];
    expect(payload.event.type).toBe('execution_updated');
    expect(payload.event.executionDump).toMatchObject({
      name: 'event-listener',
    });
    expect(payload.getSnapshot()).toMatchObject({
      executions: [expect.objectContaining({ name: 'event-listener' })],
    });
  });

  it('returns compact unstable log content without inline screenshots', async () => {
    const agent = createAgent();

    await agent.recordToReport('compact-log', {
      content: 'compact content',
    });

    const content = agent._unstableLogContent();
    const serialized = JSON.stringify(content);

    expect(serialized).toContain('"$screenshot"');
    expect(serialized).not.toContain('data:image/');
  });
});
