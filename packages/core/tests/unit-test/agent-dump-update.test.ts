import { Agent } from '@/agent';
import type { ExecutionDump, ReportMeta } from '@/types';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('openai');

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    describe: () => 'test page',
    size: async () => ({ width: 1280, height: 720 }),
    screenshotBase64: async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  } as any;
}

function createLargeBase64DataUri(byteSize: number): string {
  const payload = 'A'.repeat(byteSize);
  return `data:image/png;base64,${payload}`;
}

describe('Agent dump update screenshot serialization', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes report attributes to report generator updates', async () => {
    const reportAttributes = { 'data-group-id': 'cli-session-report' };
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
      reportAttributes,
    });

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    await agent.recordToReport('snapshot', { content: 'check attributes' });

    expect(reportGeneratorStub.onExecutionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      reportAttributes,
    );

    await agent.destroy();
  });

  it('serializes screenshots as references in dump update callbacks after report persistence', async () => {
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
    });

    const reportGeneratorStub = {
      onExecutionUpdate(execution: ExecutionDump, _reportMeta: ReportMeta) {
        for (const screenshot of execution.collectScreenshots()) {
          screenshot.markPersistedInline('/tmp/mock-report.html');
        }
      },
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    const listener = vi.fn();
    agent.onDumpUpdate = listener;

    await agent.recordToReport('snapshot', { content: 'check screenshot' });

    expect(listener).toHaveBeenCalledTimes(1);
    const [dumpString] = listener.mock.calls[0] as [string];

    expect(dumpString).toContain('"type":"midscene_screenshot_ref"');
    expect(dumpString).not.toContain('data:image/png;base64');
    const screenshotsInAgentDump = (agent as any).dump.collectAllScreenshots();
    for (const screenshot of screenshotsInAgentDump) {
      expect(screenshot.hasBase64()).toBe(false);
    }
    expect(reportGeneratorStub.flush).toHaveBeenCalled();

    await agent.destroy();
  });

  it('uses provided screenshot data when recording to report', async () => {
    const screenshotBase64 = vi
      .fn()
      .mockRejectedValue(new Error('should not capture again'));
    const agent = new Agent(
      {
        ...createMockInterface(),
        screenshotBase64,
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    const providedScreenshot =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    await agent.recordToReport('snapshot', {
      screenshotBase64: providedScreenshot,
    });

    expect(screenshotBase64).not.toHaveBeenCalled();
    expect(reportGeneratorStub.onExecutionUpdate).toHaveBeenCalled();

    await agent.destroy();
  });

  it('records multiple provided screenshots in one report entry', async () => {
    const screenshotBase64 = vi
      .fn()
      .mockRejectedValue(new Error('should not capture again'));
    const agent = new Agent(
      {
        ...createMockInterface(),
        screenshotBase64,
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    const beforeScreenshot = 'data:image/png;base64,before';
    const afterScreenshot = 'data:image/png;base64,after';
    await agent.recordToReport('comparison', {
      content: 'before and after state',
      subType: 'Checkpoint',
      screenshots: [
        { base64: beforeScreenshot, description: 'Before click' },
        { base64: afterScreenshot, description: 'After click' },
      ],
    });

    expect(screenshotBase64).not.toHaveBeenCalled();
    expect(reportGeneratorStub.onExecutionUpdate).toHaveBeenCalledTimes(1);

    const execution = reportGeneratorStub.onExecutionUpdate.mock
      .calls[0][0] as ExecutionDump;
    expect(execution.name).toBe('Checkpoint - comparison');
    expect(execution.description).toBe('before and after state');

    const task = execution.tasks[0];
    expect(task.type).toBe('Log');
    expect(task.subType).toBe('Checkpoint');
    expect(task.recorder).toHaveLength(2);
    expect(task.recorder?.map((item) => item.description)).toEqual([
      'Before click',
      'After click',
    ]);
    expect(task.recorder?.map((item) => item.screenshot?.base64)).toEqual([
      beforeScreenshot,
      afterScreenshot,
    ]);
    expect(task.recorder?.[0].ts ?? 0).toBeLessThan(task.recorder?.[1].ts ?? 0);

    await agent.destroy();
  });

  it('accepts customScreenshotData as a recordToReport alias', async () => {
    const screenshotBase64 = vi
      .fn()
      .mockRejectedValue(new Error('should not capture again'));
    const agent = new Agent(
      {
        ...createMockInterface(),
        screenshotBase64,
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    const screenshot = 'data:image/png;base64,from-issue-api';
    await agent.recordToReport('issue api', {
      customScreenshotData: [
        { base64: screenshot, description: 'Issue API screenshot' },
      ],
    });

    expect(screenshotBase64).not.toHaveBeenCalled();
    const execution = reportGeneratorStub.onExecutionUpdate.mock
      .calls[0][0] as ExecutionDump;
    expect(execution.name).toBe('Log - issue api');
    expect(execution.tasks[0].subType).toBe('Screenshot');
    expect(execution.tasks[0].recorder?.[0].description).toBe(
      'Issue API screenshot',
    );
    expect(execution.tasks[0].recorder?.[0].screenshot?.base64).toBe(
      screenshot,
    );

    await agent.destroy();
  });

  it('rejects an empty custom screenshot list', async () => {
    const screenshotBase64 = vi
      .fn()
      .mockRejectedValue(new Error('should not capture again'));
    const agent = new Agent(
      {
        ...createMockInterface(),
        screenshotBase64,
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    await expect(
      agent.recordToReport('empty screenshots', {
        screenshots: [],
      }),
    ).rejects.toThrow('recordToReport: screenshots cannot be empty');

    expect(screenshotBase64).not.toHaveBeenCalled();
    expect(reportGeneratorStub.onExecutionUpdate).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('rejects multiple custom screenshot sources', async () => {
    const screenshotBase64 = vi
      .fn()
      .mockRejectedValue(new Error('should not capture again'));
    const agent = new Agent(
      {
        ...createMockInterface(),
        screenshotBase64,
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    await expect(
      agent.recordToReport('conflicting screenshots', {
        screenshotBase64: 'data:image/png;base64,legacy',
        screenshots: [{ base64: 'data:image/png;base64,custom' }],
      }),
    ).rejects.toThrow(
      'recordToReport: provide only one of screenshots, customScreenshotData, or screenshotBase64',
    );

    expect(screenshotBase64).not.toHaveBeenCalled();
    expect(reportGeneratorStub.onExecutionUpdate).not.toHaveBeenCalled();

    await agent.destroy();
  });

  it('records failed log entries for runner-level errors', async () => {
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
    });

    const reportGeneratorStub = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    const error = new Error('javascript gate failed');
    await agent.recordErrorToReport('YAML task failed - JavaScript gate', {
      error,
      content: 'Step 0 failed while running YAML task "JavaScript gate".',
    });

    expect(reportGeneratorStub.onExecutionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'YAML task failed - JavaScript gate',
        tasks: [
          expect.objectContaining({
            type: 'Log',
            subType: 'Error',
            status: 'failed',
            errorMessage: 'javascript gate failed',
          }),
        ],
      }),
      expect.anything(),
      undefined,
    );

    await agent.destroy();
  });

  it('keeps dump callback payload bounded after many updates with large screenshots', async () => {
    const largeScreenshot = createLargeBase64DataUri(200_000);
    const agent = new Agent(
      {
        ...createMockInterface(),
        screenshotBase64: async () => largeScreenshot,
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    const reportGeneratorStub = {
      onExecutionUpdate(execution: ExecutionDump, _reportMeta: ReportMeta) {
        for (const screenshot of execution.collectScreenshots()) {
          screenshot.markPersistedInline('/tmp/mock-report.html');
        }
      },
      flush: vi.fn(async () => {}),
      finalize: vi.fn(async () => undefined),
      getReportPath: vi.fn(() => undefined),
    };

    (agent as any).reportGenerator = reportGeneratorStub;

    let maxDumpLength = 0;
    let leakedBase64Count = 0;
    agent.onDumpUpdate = (dumpString) => {
      maxDumpLength = Math.max(maxDumpLength, dumpString.length);
      if (!dumpString.includes('"type":"midscene_screenshot_ref"')) {
        leakedBase64Count += 1;
      }
      if (dumpString.includes('data:image/png;base64')) {
        leakedBase64Count += 1;
      }
      const screenshotsInAgentDump = (
        agent as any
      ).dump.collectAllScreenshots();
      for (const screenshot of screenshotsInAgentDump) {
        if (screenshot.hasBase64()) {
          leakedBase64Count += 1;
          break;
        }
      }
    };

    const iterations = 80;
    for (let i = 0; i < iterations; i++) {
      await agent.recordToReport(`snapshot-${i}`, {
        content: `stress-${i}`,
      });
    }

    // With 80 * 200KB screenshots, inline base64 would push dumps > 16MB.
    // Reference serialization should stay lightweight.
    expect(leakedBase64Count).toBe(0);
    expect(maxDumpLength).toBeLessThan(500_000);
    expect(reportGeneratorStub.flush).toHaveBeenCalledTimes(iterations);

    await agent.destroy();
  });

  it('destroys the interface before flushing the final report', async () => {
    const order: string[] = [];
    const agent = new Agent(
      {
        ...createMockInterface(),
        destroy: vi.fn(async () => {
          order.push('interface.destroy');
        }),
      } as any,
      {
        modelConfig,
        generateReport: false,
      },
    );

    (agent as any).reportGenerator = {
      onExecutionUpdate: vi.fn(),
      flush: vi.fn(async () => {
        order.push('report.flush');
      }),
      finalize: vi.fn(async () => {
        order.push('report.finalize');
        return undefined;
      }),
      getReportPath: vi.fn(() => undefined),
    };

    await agent.destroy();

    expect(order).toEqual([
      'interface.destroy',
      'report.flush',
      'report.finalize',
    ]);
  });
});
