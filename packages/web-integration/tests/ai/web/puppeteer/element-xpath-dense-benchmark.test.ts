import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PuppeteerAgent } from '@/puppeteer';
import { expect, it, vi } from 'vitest';
import { createTestContext, getFixturePath } from './test-utils';
import { launchPage } from './utils';

vi.setConfig({ testTimeout: 10 * 60 * 1000 });

const context = createTestContext();

interface BenchmarkCase {
  invoiceId: string;
  action: string;
  actionLabel: string;
}

const benchmarkCases: Record<string, BenchmarkCase> = {
  'inv-1041-view': {
    invoiceId: 'INV-1041',
    action: 'view-details',
    actionLabel: 'view details',
  },
  'inv-1047-edit': {
    invoiceId: 'INV-1047',
    action: 'edit-invoice',
    actionLabel: 'edit invoice',
  },
  'inv-1053-download': {
    invoiceId: 'INV-1053',
    action: 'download-pdf',
    actionLabel: 'download PDF',
  },
  'inv-1068-archive': {
    invoiceId: 'INV-1068',
    action: 'archive-invoice',
    actionLabel: 'archive invoice',
  },
  'inv-1086-view': {
    invoiceId: 'INV-1086',
    action: 'view-details',
    actionLabel: 'view details',
  },
  'inv-1091-archive': {
    invoiceId: 'INV-1091',
    action: 'archive-invoice',
    actionLabel: 'archive invoice',
  },
  'inv-1104-download': {
    invoiceId: 'INV-1104',
    action: 'download-pdf',
    actionLabel: 'download PDF',
  },
  'inv-1118-edit': {
    invoiceId: 'INV-1118',
    action: 'edit-invoice',
    actionLabel: 'edit invoice',
  },
  'inv-1137-archive': {
    invoiceId: 'INV-1137',
    action: 'archive-invoice',
    actionLabel: 'archive invoice',
  },
  'inv-1142-view': {
    invoiceId: 'INV-1142',
    action: 'view-details',
    actionLabel: 'view details',
  },
  'inv-1161-edit': {
    invoiceId: 'INV-1161',
    action: 'edit-invoice',
    actionLabel: 'edit invoice',
  },
  'inv-1180-archive': {
    invoiceId: 'INV-1180',
    action: 'archive-invoice',
    actionLabel: 'archive invoice',
  },
  'inv-1209-download': {
    invoiceId: 'INV-1209',
    action: 'download-pdf',
    actionLabel: 'download PDF',
  },
  'inv-1234-view': {
    invoiceId: 'INV-1234',
    action: 'view-details',
    actionLabel: 'view details',
  },
  'inv-1277-archive': {
    invoiceId: 'INV-1277',
    action: 'archive-invoice',
    actionLabel: 'archive invoice',
  },
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
      const hitBy = record.hitBy as { from?: string } | undefined;
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

it.skipIf(!process.env.ELEMENT_XPATH_DENSE_VARIANT)(
  'records one dense element XPath benchmark sample',
  async () => {
    const variant = process.env.ELEMENT_XPATH_DENSE_VARIANT ?? 'baseline';
    const caseId = process.env.ELEMENT_XPATH_DENSE_CASE ?? 'inv-1041-view';
    const round = process.env.ELEMENT_XPATH_DENSE_ROUND ?? '1';
    const modelName = process.env.MIDSCENE_MODEL_NAME ?? 'unknown-model';
    const modelArtifactId = modelName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const benchmarkCase = benchmarkCases[caseId];
    if (!benchmarkCase) {
      throw new Error(
        `Unknown ELEMENT_XPATH_DENSE_CASE "${caseId}". Expected one of: ${Object.keys(benchmarkCases).join(', ')}`,
      );
    }

    const useElementXpaths = variant === 'element-xpath';
    if (!useElementXpaths && variant !== 'baseline') {
      throw new Error(
        `Unknown ELEMENT_XPATH_DENSE_VARIANT "${variant}". Expected "baseline" or "element-xpath".`,
      );
    }

    const artifactId = `${modelArtifactId}-${variant}-${caseId}-r${round}`;
    const reportFileName = `element-xpath-dense-${artifactId}`;
    const reportRoot = path.join(process.cwd(), 'midscene_run', 'report');
    const evidenceDir = path.join(reportRoot, 'element-xpath-dense-evidence');
    await mkdir(evidenceDir, { recursive: true });

    const { originPage, reset } = await launchPage(
      `file://${getFixturePath('element-xpath-dense-action-table.html')}`,
      { viewport: { width: 1280, height: 720 } },
    );
    context.resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      generateReport: true,
      persistExecutionDump: false,
      outputFormat: 'single-html',
      reportFileName,
      groupName: `Dense element XPath evidence: ${artifactId}`,
      groupDescription:
        'One atomic click among 96 visually similar invoice row actions.',
    });
    context.agent = agent;

    const prompt = `Click the ${benchmarkCase.actionLabel} action for invoice ${benchmarkCase.invoiceId} exactly once.`;
    const options = {
      cacheable: false,
      deepThink: false as const,
      ...(useElementXpaths
        ? {
            loadElementXpaths: [
              getFixturePath('element-xpath-dense-action-table.yaml'),
            ],
          }
        : {}),
    };

    const startedAt = performance.now();
    let runError: unknown;
    try {
      await agent.aiAct(prompt, options);
    } catch (error) {
      runError = error;
    }
    const wallTimeMs = Math.round(performance.now() - startedAt);
    const metrics = agent.metrics;
    const dump = agent.dumpDataString({ inlineScreenshots: true });
    const dumpObject = JSON.parse(dump);
    const locate = locateEvidence(dumpObject);
    const actualClicks = await originPage.evaluate(
      () =>
        (
          window as typeof window & {
            __denseActionClicks: Array<{
              invoiceId: string;
              action: string;
            }>;
          }
        ).__denseActionClicks,
    );
    const expectedClicks = [
      {
        invoiceId: benchmarkCase.invoiceId,
        action: benchmarkCase.action,
      },
    ];
    const domMatched =
      JSON.stringify(actualClicks) === JSON.stringify(expectedClicks);
    const xpathResolved = !useElementXpaths || locate.xpathHits === 1;

    await agent.destroy();
    context.agent = null;
    const generatedReportPath = path.join(reportRoot, `${reportFileName}.html`);
    const copiedReportPath = path.join(
      evidenceDir,
      `${artifactId}.report.html`,
    );
    await copyFile(generatedReportPath, copiedReportPath);
    const reportSha256 = createHash('sha256')
      .update(await readFile(copiedReportPath))
      .digest('hex');
    await reset();
    context.resetFn = null;

    const evidence = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      gitCommit: process.env.ELEMENT_XPATH_DENSE_COMMIT,
      variant,
      caseId,
      round,
      prompt,
      options: {
        loadElementXpaths: useElementXpaths,
        cacheable: false,
        deepThink: false,
        modelRetryCount: process.env.MIDSCENE_MODEL_RETRY_COUNT,
        modelReasoningEnabled: process.env.MIDSCENE_MODEL_REASONING_ENABLED,
      },
      model: {
        name: modelName,
        family: process.env.MIDSCENE_MODEL_FAMILY,
      },
      node: process.version,
      wallTimeMs,
      metrics,
      locateEvidence: locate,
      expectedClicks,
      actualClicks,
      domMatched,
      xpathResolved,
      reportSha256,
      success: !runError && domMatched && xpathResolved,
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

    if (runError) throw runError;
    expect(actualClicks).toEqual(expectedClicks);
    if (useElementXpaths) {
      expect(locate.xpathHits).toBe(1);
    }
  },
);
