import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PuppeteerAgent } from '@/puppeteer';
import { expect, it, vi } from 'vitest';
import { getFixturePath } from './test-utils';
import { launchPage } from './utils';

vi.setConfig({ testTimeout: 10 * 60 * 1000 });

const task =
  'Fill the entire profile form: first name Alice, last name Chen, email alice@example.com, company Midscene Labs, phone +8613800138000, and notes "Repeatable workflow benchmark". Do not submit.';

const expectedValues = {
  firstName: 'Alice',
  lastName: 'Chen',
  email: 'alice@example.com',
  company: 'Midscene Labs',
  phone: '+8613800138000',
  notes: 'Repeatable workflow benchmark',
};

function locateEvidence(value: unknown) {
  const evidence = {
    locateTasks: 0,
    xpathHits: 0,
    cacheHits: 0,
    planHits: 0,
    aiLocateUsages: 0,
  };
  const visit = (current: unknown) => {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    const record = current as Record<string, unknown>;
    if (record.type === 'Planning' && record.subType === 'Locate') {
      evidence.locateTasks += 1;
      const hitBy = record.hitBy as
        | { from?: string; context?: Record<string, unknown> }
        | undefined;
      if (hitBy?.from === 'User expected path') evidence.xpathHits += 1;
      if (hitBy?.from === 'Cache') evidence.cacheHits += 1;
      if (hitBy?.from === 'Plan') evidence.planHits += 1;
      if (record.usage) evidence.aiLocateUsages += 1;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return evidence;
}

it.skipIf(!process.env.ELEMENT_XPATH_BENCH_VARIANT)(
  'records one element XPath benchmark sample',
  async () => {
    const variant = process.env.ELEMENT_XPATH_BENCH_VARIANT ?? 'baseline';
    const runId = process.env.ELEMENT_XPATH_BENCH_RUN_ID ?? 'a';
    const artifactId = `${variant}-${runId}`;
    const reportFileName = `element-xpath-evidence-${artifactId}`;
    const reportRoot = path.join(process.cwd(), 'midscene_run', 'report');
    const evidenceDir = path.join(reportRoot, 'element-xpath-evidence');
    await mkdir(evidenceDir, { recursive: true });

    const { originPage, reset } = await launchPage(
      `file://${getFixturePath('element-xpath-profile-form.html')}`,
    );
    const agent = new PuppeteerAgent(originPage, {
      generateReport: true,
      persistExecutionDump: false,
      outputFormat: 'single-html',
      reportFileName,
      groupName: `Element XPath evidence: ${artifactId}`,
      groupDescription:
        'Comparison of normal aiAct locating and a per-call element XPath map.',
    });

    const useElementXpaths = variant === 'element-xpath';
    const options = {
      cacheable: false,
      ...(useElementXpaths
        ? {
            loadElementXpaths: [getFixturePath('element-xpaths.yaml')],
          }
        : {}),
    };

    const startedAt = performance.now();
    let runError: unknown;
    try {
      await agent.aiAct(task, options);
    } catch (error) {
      runError = error;
    }
    const wallTimeMs = Math.round(performance.now() - startedAt);
    const metrics = agent.metrics;
    const dump = agent.dumpDataString({ inlineScreenshots: true });
    const dumpObject = JSON.parse(dump);
    const actualValues = await originPage.evaluate(() => ({
      firstName: (document.querySelector('#first-name') as HTMLInputElement)
        .value,
      lastName: (document.querySelector('#last-name') as HTMLInputElement)
        .value,
      email: (document.querySelector('#email') as HTMLInputElement).value,
      company: (document.querySelector('#company') as HTMLInputElement).value,
      phone: (document.querySelector('#phone') as HTMLInputElement).value,
      notes: (document.querySelector('#notes') as HTMLTextAreaElement).value,
    }));
    const domMatched =
      JSON.stringify(actualValues) === JSON.stringify(expectedValues);

    const evidence = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      gitCommit: process.env.ELEMENT_XPATH_BENCH_COMMIT,
      variant,
      runId,
      prompt: task,
      options: {
        loadElementXpaths: useElementXpaths,
        cacheable: false,
        modelRetryCount: process.env.MIDSCENE_MODEL_RETRY_COUNT,
      },
      model: {
        name: process.env.MIDSCENE_MODEL_NAME,
        family: process.env.MIDSCENE_MODEL_FAMILY,
      },
      node: process.version,
      wallTimeMs,
      metrics,
      locateEvidence: locateEvidence(dumpObject),
      expectedValues,
      actualValues,
      domMatched,
      success: !runError && domMatched,
      error:
        runError instanceof Error
          ? { name: runError.name, message: runError.message }
          : undefined,
    };

    await writeFile(
      path.join(evidenceDir, `${artifactId}.evidence.json`),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(evidenceDir, `${artifactId}.report-dump.json`),
      dump,
      'utf8',
    );

    await agent.destroy();
    await copyFile(
      path.join(reportRoot, `${reportFileName}.html`),
      path.join(evidenceDir, `${artifactId}.report.html`),
    );
    await reset();

    if (runError) throw runError;
    expect(actualValues).toEqual(expectedValues);
  },
);
