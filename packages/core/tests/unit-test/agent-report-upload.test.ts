import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent';
import type { AbstractInterface } from '@/device';
import { ReportGenerator, nullReportGenerator } from '@/report-generator';
import type { AgentOpt } from '@/types';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('openai');

const SCREENSHOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const SERVER_URL = 'https://reports.example.test/upload';
const MODEL_CONFIG = {
  MIDSCENE_MODEL_NAME: 'test-model',
  MIDSCENE_MODEL_API_KEY: 'test-key',
  MIDSCENE_MODEL_BASE_URL: 'https://api.example.test/v1',
  MIDSCENE_MODEL_INIT_CONFIG_JSON: JSON.stringify({
    REPORT_SERVER_URL: SERVER_URL,
  }),
};

function createAgent(
  options?: AgentOpt,
  interfaceOverrides?: Partial<AbstractInterface>,
) {
  return new Agent(
    {
      interfaceType: 'puppeteer',
      actionSpace: () => [],
      describe: () => 'https://example.test/checkout',
      size: async () => ({ width: 1, height: 1 }),
      screenshotBase64: async () => SCREENSHOT,
      ...interfaceOverrides,
    } as AbstractInterface,
    {
      modelConfig: MODEL_CONFIG,
      reportFileName: 'checkout',
      ...options,
    },
  );
}

describe('completed Agent report upload', () => {
  let directory: string;
  const fetchMock = rs.fn<typeof fetch>();

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'midscene-report-upload-'));
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    rs.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    rs.spyOn(ReportGenerator, 'create').mockImplementation((name, options) => {
      if (options.generateReport === false) return nullReportGenerator;
      const external = options.outputFormat === 'html-and-external-assets';
      return new ReportGenerator({
        reportPath: external
          ? join(directory, name, 'index.html')
          : join(directory, `${name}.html`),
        screenshotMode: external ? 'directory' : 'inline',
        autoPrint: false,
      });
    });
  });

  afterEach(async () => {
    rs.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('uploads the finalized file once, after cleanup writes the last execution', async () => {
    const agent = createAgent(
      {},
      {
        destroy: async () => {
          await agent.recordToReport('cleanup finished', {
            content: 'final cleanup state',
            screenshotBase64: SCREENSHOT,
          });
        },
      },
    );
    await agent.getUIContext();
    await agent.recordToReport('test finished', {
      screenshotBase64: SCREENSHOT,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await agent.destroy();
    await agent.destroy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(SERVER_URL);
    expect(request?.method).toBe('POST');
    const body = JSON.parse(String(request?.body));
    expect(body.test_url).toBe('https://example.test/checkout');
    expect(body.report_file_name).toBe('checkout.html');
    expect(body.report_html).toBe(await readFile(agent.reportFile!, 'utf-8'));
    expect(body.report_html).toContain('final cleanup state');
    expect(body.report_html).toContain('test finished');
  });

  it('waits for the upload before resolving destroy', async () => {
    let finishUpload!: (response: Response) => void;
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    fetchMock.mockImplementation(() => {
      requestStarted();
      return new Promise((resolve) => {
        finishUpload = resolve;
      });
    });
    const agent = createAgent();
    await agent.recordToReport('finished', { screenshotBase64: SCREENSHOT });
    let destroyed = false;
    const completion = agent.destroy().then(() => {
      destroyed = true;
    });
    await started;
    expect(destroyed).toBe(false);
    finishUpload(new Response(null, { status: 204 }));
    await completion;
    expect(destroyed).toBe(true);
  });

  it('uploads separate reports from the same repository', async () => {
    for (const reportFileName of ['first', 'second']) {
      const agent = createAgent({ reportFileName });
      await agent.recordToReport(reportFileName, {
        screenshotBase64: SCREENSHOT,
      });
      await agent.destroy();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(
        ([, request]) => JSON.parse(String(request?.body)).report_file_name,
      ),
    ).toEqual(['first.html', 'second.html']);
  });

  it('inlines external screenshots in the uploaded report', async () => {
    const agent = createAgent({ outputFormat: 'html-and-external-assets' });
    await agent.recordToReport('external screenshot', {
      screenshotBase64: SCREENSHOT,
    });
    await agent.destroy();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.report_file_name).toBe('checkout.html');
    expect(body.report_html).toContain(SCREENSHOT);
    expect(body.report_html).toContain('external screenshot');
    expect(await readFile(agent.reportFile!, 'utf-8')).toContain(
      'data-screenshot-mode="directory"',
    );
  });

  it.each(['no server', 'disabled report', 'no executions'])(
    'skips uploading with %s',
    async (scenario) => {
      const agent = createAgent({
        ...(scenario === 'no server'
          ? {
              modelConfig: {
                ...MODEL_CONFIG,
                MIDSCENE_MODEL_INIT_CONFIG_JSON: '{}',
              },
            }
          : {}),
        ...(scenario === 'disabled report' ? { generateReport: false } : {}),
      });
      if (scenario !== 'no executions') {
        await agent.recordToReport('finished', {
          screenshotBase64: SCREENSHOT,
        });
      }
      await agent.destroy();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['http', 'network', 'timeout'])(
    'preserves the report when uploading fails: %s',
    async (failure) => {
      if (failure === 'http')
        fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
      else
        fetchMock.mockRejectedValue(
          failure === 'timeout'
            ? new DOMException('Timed out', 'TimeoutError')
            : new Error('offline'),
        );
      const agent = createAgent();
      await agent.recordToReport('failed test evidence', {
        screenshotBase64: SCREENSHOT,
      });
      await expect(agent.destroy()).resolves.toBeUndefined();
      expect(await readFile(agent.reportFile!, 'utf-8')).toContain(
        'failed test evidence',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('uploads failed task status and evidence', async () => {
    const agent = createAgent();
    await agent.recordErrorToReport('checkout failed', {
      error: new Error('checkout assertion failed'),
      screenshotBase64: SCREENSHOT,
    });
    await agent.destroy();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.report_html).toContain('checkout assertion failed');
    expect(body.report_html).toContain('"status":"failed"');
  });

  it('uploads even when device cleanup fails, then preserves the cleanup error', async () => {
    const cleanupError = new Error('device disconnected');
    const agent = createAgent(
      {},
      {
        destroy: async () => {
          throw cleanupError;
        },
      },
    );
    await agent.recordToReport('failure evidence', {
      screenshotBase64: SCREENSHOT,
    });
    await expect(agent.destroy()).rejects.toBe(cleanupError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
