import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer from 'puppeteer';
import { allowedUrl } from './config.mjs';
import { executionErrorCode } from './execution-error.mjs';

let browser;
let active = false;
let cancelled = false;

// Closing the owning process must not leave its test browser running.
process.on('disconnect', async () => {
  await browser?.close().catch(() => {});
});

function nativeReportHtml(agent) {
  const html = agent.reportHTMLString({ inlineScreenshots: true });
  if (!html || !html.includes('midscene_web_dump'))
    throw new Error('Native report generation failed');
  return html;
}

async function execute({ previewUrl, policy, directory, headSha }) {
  const preview = allowedUrl(previewUrl, policy);
  browser = await puppeteer.launch({ headless: true });
  if (cancelled) {
    await browser.close();
    throw new Error('CANCELLED');
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    try {
      const url = request.url();
      if (!url.startsWith('data:') && !url.startsWith('blob:'))
        allowedUrl(url, policy);
      void request.continue().catch(() => {});
    } catch {
      void request.abort().catch(() => {});
    }
  });
  page.on('popup', (popup) => {
    void popup.close().catch(() => {});
  });
  const revisionUrl = allowedUrl(
    new URL(policy.revisionPath, preview.origin).href,
    policy,
  ).href;
  async function revision() {
    await page.setCacheEnabled(false);
    const response = await page.goto(revisionUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!response?.ok()) throw new Error('REVISION_UNAVAILABLE');
    return (await response.json()).sha;
  }
  const result = {
    status: 'completed',
    criteria: [],
    model: process.env.MIDSCENE_MODEL_NAME ?? null,
  };
  try {
    result.observedRevisionBefore = await revision();
    if (result.observedRevisionBefore !== headSha)
      throw new Error('REVISION_MISMATCH');
    for (const criterion of policy.criteria) {
      const outcome = { id: criterion.id, status: 'passed', steps: [] };
      const agent = new PuppeteerAgent(page, {
        generateReport: false,
        cache: false,
        replanningCycleLimit: 10,
      });
      try {
        const target = allowedUrl(
          new URL(criterion.path, preview.origin).href,
          policy,
        );
        const response = await page.goto(target.href, {
          waitUntil: 'networkidle2',
          timeout: 30_000,
        });
        if (!response?.ok()) throw new Error('PAGE_UNAVAILABLE');
        for (const step of criterion.steps) {
          const record = { type: step.type, status: 'failed' };
          outcome.steps.push(record);
          await agent[step.type](step.prompt);
          record.status = 'passed';
        }
      } catch (error) {
        outcome.errorCode = executionErrorCode(error);
        outcome.status =
          outcome.errorCode === 'STEP_EXECUTION_FAILED' ? 'failed' : 'not-run';
        if (outcome.status === 'not-run') {
          result.status = 'error';
          result.errorCode = outcome.errorCode;
        }
      } finally {
        // A screenshot and the full Midscene trace are required even on success.
        try {
          await page.screenshot({
            path: path.join(directory, `${criterion.id}.png`),
          });
          await writeFile(
            path.join(directory, `${criterion.id}.trace.json`),
            agent.dumpDataString({ inlineScreenshots: true }),
          );
          await writeFile(
            path.join(directory, `${criterion.id}.midscene.html`),
            nativeReportHtml(agent),
          );
        } catch {
          outcome.status = 'failed';
          outcome.errorCode = 'EVIDENCE_CAPTURE_FAILED';
        }
        await agent.destroy();
        result.criteria.push(outcome);
      }
      if (result.status === 'error') break;
    }
    result.observedRevisionAfter = await revision();
  } catch {
    result.status = 'error';
  } finally {
    await browser.close();
  }
  return result;
}

process.on('message', async (message) => {
  if (message.type === 'cancel') {
    cancelled = true;
    await browser?.close().catch(() => {});
    process.exit(1);
  }
  if (message.type !== 'run' || active) return;
  active = true;
  try {
    const result = await execute(message.input);
    process.send({ type: 'result', result }, () => process.disconnect());
  } catch {
    await browser?.close().catch(() => {});
    process.send(
      { type: 'result', result: { status: 'error', criteria: [] } },
      () => process.disconnect(),
    );
  }
});
