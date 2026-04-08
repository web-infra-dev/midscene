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
    expect(reportGeneratorStub.flush).toHaveBeenCalled();

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
    agent.onDumpUpdate = (dumpString) => {
      maxDumpLength = Math.max(maxDumpLength, dumpString.length);
      expect(dumpString).toContain('"type":"midscene_screenshot_ref"');
      expect(dumpString).not.toContain('data:image/png;base64');
    };

    const iterations = 80;
    for (let i = 0; i < iterations; i++) {
      await agent.recordToReport(`snapshot-${i}`, {
        content: `stress-${i}`,
      });
    }

    // With 80 * 200KB screenshots, inline base64 would push dumps > 16MB.
    // Reference serialization should stay lightweight.
    expect(maxDumpLength).toBeLessThan(500_000);
    expect(reportGeneratorStub.flush).toHaveBeenCalledTimes(iterations);

    await agent.destroy();
  });
});
