import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PuppeteerAgent } from '@/puppeteer';
import { expect, it, vi } from 'vitest';
import { generateRecordXpathMap } from './record-replay-utils';
import { createTestContext, getFixturePath } from './test-utils';
import { launchPage } from './utils';

vi.setConfig({ testTimeout: 10 * 60 * 1000 });

const context = createTestContext();

type Scene =
  | 'grouped-table'
  | 'version-picker'
  | 'workflow-cards'
  | 'overlay'
  | 'canvas-workflow';

interface BenchmarkCase {
  scene: Scene;
  mapFile: string;
  prompt: string;
  targetId: string;
  action: string;
  expectXpathHit: boolean;
}

const aiActEfforts = ['fast', 'balance', 'deepThink'] as const;
type AiActEffort = (typeof aiActEfforts)[number];

function parseAiActEffort(value: string | undefined): AiActEffort {
  const effort = value ?? 'balance';
  if (!aiActEfforts.includes(effort as AiActEffort)) {
    throw new Error(
      `Unknown ELEMENT_XPATH_COMPLEX_EFFORT "${effort}". Expected one of: ${aiActEfforts.join(', ')}`,
    );
  }
  return effort as AiActEffort;
}

const sceneMapFiles: Record<Scene, string> = {
  'grouped-table': 'element-xpath-complex-grouped-table.yaml',
  'version-picker': 'element-xpath-complex-version-picker.yaml',
  'workflow-cards': 'element-xpath-complex-workflow-cards.yaml',
  overlay: 'element-xpath-complex-overlay.yaml',
  'canvas-workflow': 'element-xpath-complex-canvas.yaml',
};

function benchmarkCase(
  scene: Scene,
  prompt: string,
  targetId: string,
  action: string,
  expectXpathHit = true,
): BenchmarkCase {
  return {
    scene,
    mapFile: sceneMapFiles[scene],
    prompt,
    targetId,
    action,
    expectXpathHit,
  };
}

const benchmarkCases: Record<string, BenchmarkCase> = {
  'grouped-team-offsite': benchmarkCase(
    'grouped-table',
    'Click the priority control in the row for task Organize employee team offsite exactly once.',
    'grouped-team-offsite-priority',
    'select-priority',
  ),
  'grouped-update-runbook': benchmarkCase(
    'grouped-table',
    'Click the priority control in the row for task Update incident runbook exactly once.',
    'grouped-update-runbook-priority',
    'select-priority',
  ),
  'grouped-supplier-review': benchmarkCase(
    'grouped-table',
    'Click the priority control in the row for task Review strategic suppliers exactly once.',
    'grouped-supplier-review-priority',
    'select-priority',
  ),
  'grouped-staff-training': benchmarkCase(
    'grouped-table',
    'Click the priority control in the row for task Plan staff training exactly once.',
    'grouped-staff-training-priority',
    'select-priority',
  ),
  'version-0918': benchmarkCase(
    'version-picker',
    'Choose DF20260918_V002 from the open Demand FCST Version dropdown exactly once. Do not click the identical text in the results table.',
    'version-option-DF20260918_V002',
    'choose-version',
  ),
  'version-1002': benchmarkCase(
    'version-picker',
    'Choose DF20261002_V003 from the open Demand FCST Version dropdown exactly once. Do not click the identical text in the results table.',
    'version-option-DF20261002_V003',
    'choose-version',
  ),
  'version-1016': benchmarkCase(
    'version-picker',
    'Choose DF20261016_V001 from the open Demand FCST Version dropdown exactly once. Do not click the identical text in the results table.',
    'version-option-DF20261016_V001',
    'choose-version',
  ),
  'version-1023': benchmarkCase(
    'version-picker',
    'Choose DF20261023_V004 from the open Demand FCST Version dropdown exactly once. Do not click the identical text in the results table.',
    'version-option-DF20261023_V004',
    'choose-version',
  ),
  'card-normalize-settings': benchmarkCase(
    'workflow-cards',
    'Click the settings icon in the Normalize order fields card exactly once.',
    'card-normalize-orders-settings',
    'settings',
  ),
  'card-address-more': benchmarkCase(
    'workflow-cards',
    'Click the more icon in the Validate delivery address card exactly once.',
    'card-validate-address-more',
    'more',
  ),
  'card-reserve-copy': benchmarkCase(
    'workflow-cards',
    'Click the copy icon in the Reserve warehouse stock card exactly once.',
    'card-reserve-stock-copy',
    'copy',
  ),
  'card-audit-collapse': benchmarkCase(
    'workflow-cards',
    'Click the collapse icon in the Write audit log card exactly once.',
    'card-write-audit-log-collapse',
    'collapse',
  ),
  'overlay-policy-dialog': benchmarkCase(
    'overlay',
    'Close the Unsaved policy changes dialog using its top-right close icon exactly once.',
    'overlay-policy-dialog-close',
    'close',
  ),
  'overlay-help-drawer': benchmarkCase(
    'overlay',
    'Close the Help panel drawer using its top-right close icon exactly once.',
    'overlay-help-drawer-close',
    'close',
  ),
  'overlay-saved-toast': benchmarkCase(
    'overlay',
    'Dismiss the Policy draft saved notification using its close icon exactly once.',
    'overlay-saved-toast-close',
    'close',
  ),
  'overlay-sync-toast': benchmarkCase(
    'overlay',
    'Dismiss the Directory sync paused notification using its close icon exactly once.',
    'overlay-sync-toast-close',
    'close',
  ),
  'canvas-first-connection': benchmarkCase(
    'canvas-workflow',
    'Click the plus control on the connection between Receive request and Run policy checks exactly once.',
    'canvas-plus-receive-to-policy',
    'add-step',
    false,
  ),
  'canvas-second-connection': benchmarkCase(
    'canvas-workflow',
    'Click the plus control on the connection between Run policy checks and Finish workflow exactly once.',
    'canvas-plus-policy-to-finish',
    'add-step',
    false,
  ),
};

const targetOnlyElementNames: Record<string, string> = {
  'version-0918':
    'DF20260918_V002 option in the open Demand FCST Version dropdown',
  'version-1002':
    'DF20261002_V003 option in the open Demand FCST Version dropdown',
  'version-1016':
    'DF20261016_V001 option in the open Demand FCST Version dropdown',
  'version-1023':
    'DF20261023_V004 option in the open Demand FCST Version dropdown',
  'card-normalize-settings': 'Settings icon in the Normalize order fields card',
  'card-address-more': 'More icon in the Validate delivery address card',
  'card-reserve-copy': 'Copy icon in the Reserve warehouse stock card',
  'card-audit-collapse': 'Collapse icon in the Write audit log card',
};

function locateEvidence(value: unknown) {
  const evidence = {
    locateTasks: 0,
    xpathHits: 0,
    cacheHits: 0,
    planHits: 0,
    aiLocateUsages: 0,
    resolvedXpaths: [] as string[],
    locatorPrompts: [] as string[],
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
        | { from?: string; context?: { xpath?: string } }
        | undefined;
      if (hitBy?.from === 'User expected path') {
        evidence.xpathHits += 1;
        if (hitBy.context?.xpath) {
          evidence.resolvedXpaths.push(hitBy.context.xpath);
        }
      }
      if (hitBy?.from === 'Cache') evidence.cacheHits += 1;
      if (hitBy?.from === 'Plan') evidence.planHits += 1;
      if (record.usage) evidence.aiLocateUsages += 1;

      const param = record.param as
        | { prompt?: string | { prompt?: string } }
        | undefined;
      const locatorPrompt =
        typeof param?.prompt === 'string'
          ? param.prompt
          : param?.prompt?.prompt;
      if (locatorPrompt) evidence.locatorPrompts.push(locatorPrompt);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return evidence;
}

function classifyError(error: unknown): 'none' | 'transport' | 'model' {
  if (!error) return 'none';
  const message = error instanceof Error ? error.message : String(error);
  if (
    /connect timeout|etimedout|econnreset|socket hang up|fetch failed|network error/i.test(
      message,
    )
  ) {
    return 'transport';
  }
  return 'model';
}

it.skipIf(!process.env.ELEMENT_XPATH_COMPLEX_VARIANT)(
  'records one cross-scene element XPath benchmark sample',
  async () => {
    const variant = process.env.ELEMENT_XPATH_COMPLEX_VARIANT ?? 'baseline';
    const experimentId = process.env.ELEMENT_XPATH_COMPLEX_EXPERIMENT_ID;
    const effort = parseAiActEffort(process.env.ELEMENT_XPATH_COMPLEX_EFFORT);
    const cacheable = process.env.ELEMENT_XPATH_COMPLEX_CACHEABLE === 'true';
    const recordXpath =
      process.env.ELEMENT_XPATH_COMPLEX_RECORD_XPATH === 'true';
    const generateRecordMap =
      process.env.ELEMENT_XPATH_COMPLEX_GENERATE_RECORD_MAP === 'true';
    const caseId =
      process.env.ELEMENT_XPATH_COMPLEX_CASE ?? 'grouped-team-offsite';
    const round = process.env.ELEMENT_XPATH_COMPLEX_ROUND ?? '1';
    const modelName = process.env.MIDSCENE_MODEL_NAME ?? 'unknown-model';
    const modelArtifactId = modelName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const selectedCase = benchmarkCases[caseId];
    if (!selectedCase) {
      throw new Error(
        `Unknown ELEMENT_XPATH_COMPLEX_CASE "${caseId}". Expected one of: ${Object.keys(benchmarkCases).join(', ')}`,
      );
    }

    const useFullElementXpaths = variant === 'element-xpath';
    const useTargetOnlyXpath = variant === 'target-only-xpath';
    const useGeneratedXpath = variant === 'generated-xpath';
    const useElementXpaths =
      useFullElementXpaths || useTargetOnlyXpath || useGeneratedXpath;
    if (!useElementXpaths && variant !== 'baseline') {
      throw new Error(
        `Unknown ELEMENT_XPATH_COMPLEX_VARIANT "${variant}". Expected "baseline", "element-xpath", "target-only-xpath", or "generated-xpath".`,
      );
    }

    const targetOnlyElementName = targetOnlyElementNames[caseId];
    if (useTargetOnlyXpath && !targetOnlyElementName) {
      throw new Error(
        `Target-only XPath is not configured for ELEMENT_XPATH_COMPLEX_CASE "${caseId}".`,
      );
    }

    const experimentArtifactId = experimentId
      ? experimentId
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      : undefined;
    const artifactId = [
      modelArtifactId,
      experimentArtifactId,
      variant,
      caseId,
      `r${round}`,
    ]
      .filter(Boolean)
      .join('-');
    const reportFileName = `element-xpath-complex-${artifactId}`;
    const reportRoot = path.join(process.cwd(), 'midscene_run', 'report');
    const evidenceDir = path.join(reportRoot, 'element-xpath-complex-evidence');
    await mkdir(evidenceDir, { recursive: true });

    const fixturePath = getFixturePath('element-xpath-complex-scenes.html');
    const expectedXpath = selectedCase.expectXpathHit
      ? `//*[@data-target-id="${selectedCase.targetId}"]`
      : undefined;
    let mapPath: string | undefined;
    let mapFileName: string | undefined;
    if (useFullElementXpaths) {
      mapPath = getFixturePath(selectedCase.mapFile);
      mapFileName = selectedCase.mapFile;
    } else if (useTargetOnlyXpath) {
      mapFileName = `${artifactId}.element-xpaths.yaml`;
      mapPath = path.join(evidenceDir, mapFileName);
      await writeFile(
        mapPath,
        `elements:\n  ${JSON.stringify(targetOnlyElementName)}: ${JSON.stringify(expectedXpath)}\n`,
        'utf8',
      );
    } else if (useGeneratedXpath) {
      mapPath = process.env.ELEMENT_XPATH_COMPLEX_MAP_PATH;
      if (!mapPath) {
        throw new Error(
          'ELEMENT_XPATH_COMPLEX_MAP_PATH is required for the "generated-xpath" variant.',
        );
      }
      mapFileName = path.relative(evidenceDir, mapPath);
    }
    const elementXpathEntryCount = mapPath
      ? (await readFile(mapPath, 'utf8'))
          .split('\n')
          .filter((line) => /^ {2}\S/.test(line)).length
      : 0;
    const benchmarkPath = path.join(
      process.cwd(),
      'tests',
      'ai',
      'web',
      'puppeteer',
      'element-xpath-complex-benchmark.test.ts',
    );
    const sourceEvidence = {
      fixtureSha256: createHash('sha256')
        .update(await readFile(fixturePath))
        .digest('hex'),
      benchmarkSha256: createHash('sha256')
        .update(await readFile(benchmarkPath))
        .digest('hex'),
      elementXpathFileSha256: mapPath
        ? createHash('sha256')
            .update(await readFile(mapPath))
            .digest('hex')
        : undefined,
    };

    const fixtureUrl = new URL(`file://${fixturePath}`);
    fixtureUrl.searchParams.set('scene', selectedCase.scene);
    const { originPage, reset } = await launchPage(fixtureUrl.toString(), {
      viewport: { width: 1440, height: 900 },
    });
    context.resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      generateReport: true,
      persistExecutionDump: false,
      outputFormat: 'single-html',
      reportFileName,
      groupName: `Cross-scene element XPath evidence: ${artifactId}`,
      groupDescription:
        'One atomic click in a complex page archetype derived from hard grounding cases.',
      ...(recordXpath
        ? {
            cache: {
              id: artifactId,
              strategy: 'write-only' as const,
              cacheDir: path.join(evidenceDir, 'record-cache'),
            },
          }
        : {}),
    });
    context.agent = agent;

    const options = {
      cacheable,
      effort,
      ...(useElementXpaths
        ? {
            loadElementXpaths: [mapPath as string],
          }
        : {}),
    };

    const startedAt = performance.now();
    let runError: unknown;
    try {
      await agent.aiAct(selectedCase.prompt, options);
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
            __complexBenchmarkActions: Array<{
              targetId: string;
              action: string;
            }>;
          }
        ).__complexBenchmarkActions,
    );
    const stateEvidence = await originPage.evaluate(
      ({ scene, targetId }) => {
        if (scene === 'overlay') {
          const targetElementPresent = Array.from(
            document.querySelectorAll<HTMLElement>('[data-target-id]'),
          ).some((element) => element.dataset.targetId === targetId);
          return {
            expectation: 'target-removed',
            expectedTargetRemoved: true,
            targetElementPresent,
            matched: !targetElementPresent,
          };
        }

        if (scene === 'version-picker') {
          const expectedValue = targetId.replace('version-option-', '');
          const trigger =
            document.querySelector<HTMLElement>('.version-trigger');
          const dropdown = document.querySelector<HTMLElement>(
            '[data-version-dropdown]',
          );
          const actualValue = trigger?.dataset.selectedVersion;
          const dropdownOpen = !dropdown?.hidden;
          return {
            expectation: 'version-selected-and-dropdown-closed',
            expectedValue,
            actualValue,
            dropdownOpen,
            matched: actualValue === expectedValue && !dropdownOpen,
          };
        }

        return {
          expectation: 'event-only',
          matched: true,
        };
      },
      { scene: selectedCase.scene, targetId: selectedCase.targetId },
    );
    const expectedClicks = [
      {
        targetId: selectedCase.targetId,
        action: selectedCase.action,
      },
    ];
    const domMatched =
      JSON.stringify(actualClicks) === JSON.stringify(expectedClicks);
    const xpathResolved = useGeneratedXpath
      ? locate.xpathHits > 0
      : useElementXpaths
        ? selectedCase.expectXpathHit
          ? locate.xpathHits === 1 &&
            locate.resolvedXpaths.length === 1 &&
            locate.resolvedXpaths[0] === expectedXpath
          : locate.xpathHits === 0
        : locate.xpathHits === 0;

    await agent.destroy();
    context.agent = null;
    const generatedReportPath = path.join(reportRoot, `${reportFileName}.html`);
    const copiedReportPath = path.join(
      evidenceDir,
      `${artifactId}.report.html`,
    );
    let reportSha256: string | undefined;
    let recordMapArtifact:
      | Awaited<ReturnType<typeof generateRecordXpathMap>>
      | undefined;
    try {
      await copyFile(generatedReportPath, copiedReportPath);
      reportSha256 = createHash('sha256')
        .update(await readFile(copiedReportPath))
        .digest('hex');
    } catch {
      // Preserve the primary model or action error in the evidence below.
    }
    if (generateRecordMap && !runError && domMatched && stateEvidence.matched) {
      if (!reportSha256) {
        throw new Error(
          `Cannot generate the record XPath Map because the report was not copied: ${copiedReportPath}`,
        );
      }
      recordMapArtifact = await generateRecordXpathMap(
        copiedReportPath,
        path.join(evidenceDir, 'record-replay', artifactId),
      );
    }
    await reset();
    context.resetFn = null;

    const errorClass = classifyError(runError);
    const evidence = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      gitCommit: process.env.ELEMENT_XPATH_COMPLEX_COMMIT,
      experimentId,
      variant,
      caseId,
      scene: selectedCase.scene,
      round,
      prompt: selectedCase.prompt,
      options: {
        loadElementXpaths: useElementXpaths,
        elementXpathFile: mapFileName,
        elementXpathEntryCount,
        cacheable,
        effort,
        recordXpath,
        generateRecordMap,
        modelRetryCount: process.env.MIDSCENE_MODEL_RETRY_COUNT,
        modelReasoningEnabled: process.env.MIDSCENE_MODEL_REASONING_ENABLED,
      },
      model: {
        name: modelName,
        family: process.env.MIDSCENE_MODEL_FAMILY,
      },
      node: process.version,
      sourceEvidence,
      wallTimeMs,
      metrics,
      locateEvidence: locate,
      expectedClicks,
      actualClicks,
      stateEvidence,
      expectedXpath,
      domMatched,
      xpathResolved,
      errorClass,
      validForComparison: errorClass !== 'transport',
      reportSha256,
      recordMapArtifact: recordMapArtifact
        ? {
            actionDir: path.relative(evidenceDir, recordMapArtifact.actionDir),
            actionFiles: recordMapArtifact.actionFiles.map((file) =>
              path.relative(evidenceDir, file),
            ),
            coordinateFallbackFiles:
              recordMapArtifact.coordinateFallbackFiles.map((file) =>
                path.relative(evidenceDir, file),
              ),
            mapPath: path.relative(evidenceDir, recordMapArtifact.mapPath),
            manifestPath: path.relative(
              evidenceDir,
              recordMapArtifact.manifestPath,
            ),
            elementCount: recordMapArtifact.elementCount,
            mapSha256: recordMapArtifact.mapSha256,
            steps: recordMapArtifact.steps,
          }
        : undefined,
      success:
        !runError && domMatched && xpathResolved && stateEvidence.matched,
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
    expect(xpathResolved).toBe(true);
    expect(stateEvidence.matched).toBe(true);
  },
);
