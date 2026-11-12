import { once } from 'node:events';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineNode, z } from '@midscene/test';
import {
  defineFileSetup,
  defineProjectSetup,
  defineTestProject,
} from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { config as loadEnv } from 'dotenv';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import sirv from 'sirv';

const reportRoot = dirname(fileURLToPath(import.meta.url));
// Exported settings take precedence; app-local settings override repository defaults.
loadEnv({ path: resolve(reportRoot, '.env') });
loadEnv({ path: resolve(reportRoot, '../../.env') });

interface ReportProjectContext {
  browser: Browser;
  baseUrl: string;
}

interface ReportFileContext {
  baseUrl: string;
  page: Page;
  agent: PuppeteerAgent;
}

const openReportSchema = z.object({
  path: z.string().min(1),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
  deviceScaleFactor: z.number().positive().optional(),
});

const openReport = defineNode<
  typeof openReportSchema,
  unknown,
  ReportFileContext
>({
  name: 'report.open',
  description:
    'Open a report in an isolated browser context for this YAML file.',
  inputSchema: openReportSchema,
  async execute({ scope, input, context }) {
    if (scope !== 'document') {
      throw new Error('report.open must run in a document beforeAll hook.');
    }
    const { page } = context;
    await page.setViewport({
      width: input.viewportWidth ?? 1440,
      height: input.viewportHeight ?? 800,
      deviceScaleFactor: input.deviceScaleFactor ?? 0,
    });
    await page.goto(new URL(input.path, context.baseUrl).href, {
      waitUntil: 'networkidle0',
      timeout: 60_000,
    });
    return { summary: `Opened ${input.path} in an isolated browser context.` };
  },
});

const setup = defineProjectSetup<ReportProjectContext>({
  name: 'report',
  async setup({ env, onTeardown }) {
    const server = createServer(
      sirv(resolve(reportRoot, 'dist'), { dev: true }),
    );
    onTeardown(async () => {
      if (!server.listening) return;
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolveClose();
        });
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Report static server did not bind a TCP address.');
    }
    const browser = await puppeteer.launch({
      headless: env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    onTeardown(() => browser.close());
    return { browser, baseUrl: `http://127.0.0.1:${address.port}/` };
  },
});

const fileSetup = defineFileSetup<ReportFileContext, ReportProjectContext>({
  name: 'report-file',
  async setup({ projectContext, signal, onTeardown }) {
    if (!projectContext) {
      throw new Error('Report project setup did not complete.');
    }
    const browserContext = await projectContext.browser.createBrowserContext();
    onTeardown(() => browserContext.close());
    signal.throwIfAborted();
    const page = await browserContext.newPage();
    const agent = new PuppeteerAgent(page);
    // File cleanup runs in reverse order: Agent, then context and its Page.
    onTeardown(() => agent.destroy());
    return { baseUrl: projectContext.baseUrl, page, agent };
  },
});

export default defineTestProject<ReportFileContext, ReportProjectContext>({
  // midscene-action publishes a report directory whose entry is index.html.
  output: { reportFormat: 'html-and-external-assets' },
  projects: [
    {
      name: 'report',
      setup,
      fileSetup,
      files: { include: ['e2e/*.yaml'] },
      retry: 0,
    },
  ],

  nodes: [
    openReport,
    ...createMidsceneNodes<ReportFileContext>({
      agentClass: PuppeteerAgent,
      getAgent: ({ context }) => context.agent,
    }),
  ],
  test: { maxConcurrentFiles: 3, bail: 0, testTimeout: 600_000 },
});
