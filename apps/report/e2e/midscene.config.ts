import { once } from 'node:events';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineNode, z } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { config as loadEnv } from 'dotenv';
import puppeteer, { type Browser } from 'puppeteer';
import sirv from 'sirv';

const reportRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Exported settings take precedence; app-local settings override repository defaults.
loadEnv({ path: resolve(reportRoot, '.env') });
loadEnv({ path: resolve(reportRoot, '../../.env') });

interface ReportContext {
  browser: Browser;
  baseUrl: string;
  agent?: PuppeteerAgent;
}

const openReportSchema = z.object({
  path: z.string().min(1),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
  deviceScaleFactor: z.number().positive().optional(),
});

const openReport = defineNode<typeof openReportSchema, unknown, ReportContext>({
  name: 'report.open',
  description:
    'Open a report in an isolated browser context for this YAML file.',
  inputSchema: openReportSchema,
  async execute({ scope, input, context, onTeardown }) {
    if (scope !== 'document') {
      throw new Error('report.open must run in a document beforeAll hook.');
    }
    if (context.agent) {
      throw new Error(
        'The previous report document has not released its Agent.',
      );
    }
    const browserContext = await context.browser.createBrowserContext();
    // Register immediately so navigation failures also close the Page/context.
    onTeardown(() => browserContext.close());
    const page = await browserContext.newPage();
    await page.setViewport({
      width: input.viewportWidth ?? 1440,
      height: input.viewportHeight ?? 800,
      deviceScaleFactor: input.deviceScaleFactor ?? 0,
    });
    const agent = new PuppeteerAgent(page);
    context.agent = agent;
    // File cleanup runs in reverse order: Agent, then context and its Page.
    onTeardown(async () => {
      try {
        await agent.destroy();
      } finally {
        context.agent = undefined;
      }
    });
    await page.goto(new URL(input.path, context.baseUrl).href, {
      waitUntil: 'networkidle0',
      timeout: 60_000,
    });
    return { summary: `Opened ${input.path} in an isolated browser context.` };
  },
});

const setup = defineProjectSetup<ReportContext>({
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

export default defineTestProject<ReportContext>({
  projects: [
    { name: 'report', setup, files: { include: ['e2e/*.yaml'] }, retry: 0 },
  ],

  nodes: [
    openReport,
    ...createMidsceneNodes<ReportContext>({
      agentClass: PuppeteerAgent,
      getAgent: ({ context }) => {
        if (!context.agent) {
          throw new Error('Open a report with report.open in beforeAll first.');
        }
        return context.agent;
      },
    }),
  ],
  // Files share the browser/server, but own their context, Page and Agent.
  test: { maxConcurrentFiles: 1, bail: 0, testTimeout: 600_000 },
});
