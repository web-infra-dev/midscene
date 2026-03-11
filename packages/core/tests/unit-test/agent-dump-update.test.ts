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

  it('serializes dump once during task updates when a dump listener is registered', () => {
    const agent = createAgent();
    const dumpDataStringSpy = vi
      .spyOn(agent, 'dumpDataString')
      .mockReturnValue('serialized-dump');
    const listener = vi.fn();
    const onTaskUpdate = (agent as any).taskExecutor.hooks.onTaskUpdate;

    agent.addDumpUpdateListener(listener);

    onTaskUpdate({
      dump: () => createExecutionDump('with-listener'),
    });

    expect(dumpDataStringSpy).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      'serialized-dump',
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
});
