import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { summarizeCategories } from '../../dashboard/src/report-template/category-summary-data.js';
import { buildReportDataFromResultsFile } from '../../dashboard/src/report-template/results-adapter.js';
import type { MidsceneResultsFileData } from '../midscene/types.js';
import { embedReportImages } from './embed-images.js';

function fixture(): MidsceneResultsFileData {
  const config: MidsceneResultsFileData['config'] = {
    meta: { title: 'Grounding report test', objective: '', note: '' },
    selection: {
      modelIds: ['model'],
      caseNames: ['basic', 'refusal', 'error'],
      excludeCaseNames: [],
      imageTypes: ['hd'],
      promptSource: 'primary',
    },
    execution: { iterations: 1, providerConcurrency: 1, runId: 'test' },
    locate: {
      implementation: 'aiLocate',
      useDeepLocate: false,
      aiActDeepThink: false,
    },
    modelConfig: {},
    debug: { enableLangSmith: false },
  };
  const version = {
    branch: 'test',
    commitHash: 'abc',
    dirtyFiles: [],
    isDirty: false,
  };
  return {
    schemaVersion: 1,
    runId: 'test',
    createdAt: '2026-09-30T00:00:00Z',
    completedAt: '2026-09-30T00:01:00Z',
    generatedAt: '2026-09-30T00:01:00Z',
    status: 'completed',
    error: null,
    meta: config.meta,
    config,
    progress: { total: 3, completed: 3, currentDescription: '' },
    outcomes: { success: 2, failed: 1, pending: 0 },
    versions: { grounding: version, midscene: version },
    midsceneRepo: {
      repoPath: '.',
      action: 'existing',
      commitHash: 'abc',
      dirtyFiles: [],
    },
    models: [
      {
        id: 'model',
        alias: 'Test model',
        shortName: '',
        logo: '',
        family: 'gpt-6',
        providerId: 'test',
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'test',
          MIDSCENE_MODEL_BASE_URL: '',
          MIDSCENE_MODEL_FAMILY: 'gpt-6',
        },
      },
    ],
    cases: ['basic', 'refusal', 'error'].map((caseName, index) => ({
      caseName,
      prompt: 'Find the target',
      fallbackPrompt: '',
      tags: [],
      note: '',
      platform: index === 0 ? 'web' : 'mobile',
      taskClass: index === 0 ? 'basic' : 'refusal',
      images: [
        {
          fileName: 'screen.png',
          imageType: 'hd',
          imageRelativePath: 'screen.png',
          gtBox: index === 0 ? [0, 0, 10, 10] : null,
          expectedOutcome: index === 0 ? 'point' : 'refusal',
        },
      ],
    })),
    items: ['basic', 'refusal', 'error'].map((caseName, index) => ({
      caseName,
      planItemId: String(index),
      modelId: 'model',
      modelAlias: 'Test model',
      promptType: 'primary',
      imageType: 'hd',
      imageFileName: 'screen.png',
      iteration: 1,
      deepLocate: false,
      locateImplementation: 'aiLocate',
      durationMs: 10,
      finished: index !== 2,
      hitGt: index === 0,
      answerCorrect: index !== 2,
      expectedOutcome: index === 0 ? 'point' : 'refusal',
      locateResult:
        index === 0
          ? { raw: {}, center: [5, 5], outcome: 'located' }
          : index === 1
            ? { raw: {}, outcome: 'not-found' }
            : undefined,
      error: index === 2 ? 'Cannot parse model response' : undefined,
    })),
  };
}

test('report counts explicit refusal and retains parse failures in the full denominator', async () => {
  const data = await buildReportDataFromResultsFile({
    resultsFile: fixture(),
    loadImageMeta: async () => ({ width: 20, height: 20 }),
  });
  assert.equal(data.scoringMode, 'answer');
  assert.equal(data.modelSummaries[0].hitCount, 2);
  assert.equal(data.modelSummaries[0].scoreDenominator, 3);
  assert.equal(data.modelSummaries[0].hitRate, 2 / 3);
  assert.equal(data.imageDetails[2].correctCount, 0);
  assert.equal(data.imageDetails[2].accuracy, 0);
  assert.equal(data.imageDetails[1].requests[0].locate.abstained, true);
  const rows = summarizeCategories(data);
  assert.deepEqual(
    rows
      .find((row) => row.platform === 'Web' && row.category === 'Basic')
      ?.scores.get('model'),
    { correct: 1, total: 1, pending: 0 },
  );
  assert.deepEqual(
    rows
      .find((row) => row.platform === 'Mobile' && row.category === 'Refusal')
      ?.scores.get('model'),
    { correct: 1, total: 2, pending: 0 },
  );
  assert.deepEqual(
    rows.find((row) => row.platform === 'All')?.scores.get('model'),
    { correct: 2, total: 3, pending: 0 },
  );
});

test('standalone reports embed original screenshot bytes without mutating results', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'grounding-report-'));
  try {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTz8AAAAASUVORK5CYII=',
      'base64',
    );
    await writeFile(path.join(directory, 'screen.png'), bytes);
    const source = fixture();
    const embedded = await embedReportImages(source, directory);
    assert.equal(source.cases[0].images[0].imageRelativePath, 'screen.png');
    const uri = embedded.cases[0].images[0].imageRelativePath;
    assert.equal(uri, `data:image/png;base64,${bytes.toString('base64')}`);
    assert.deepEqual(
      embedded.cases[0].images[0].gtBox,
      source.cases[0].images[0].gtBox,
    );
    assert.equal(embedded.items, source.items);
    await assert.rejects(
      embedReportImages(source, path.join(directory, 'missing')),
      /ENOENT/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('stopped partial runs keep every planned model, case and iteration without turning pending into errors', async () => {
  const results = fixture();
  results.status = 'stopped';
  results.items = results.items.slice(0, 1);
  results.models.push({
    ...results.models[0],
    id: 'unstarted',
    alias: 'Unstarted model',
  });
  results.config.selection.modelIds.push('unstarted');
  results.config.execution.iterations = 2;
  results.progress = { total: 12, completed: 1, currentDescription: 'stopped' };
  results.outcomes = { success: 1, failed: 0, pending: 11 };
  const data = await buildReportDataFromResultsFile({
    resultsFile: results,
    loadImageMeta: async () => ({ width: 20, height: 20 }),
  });
  assert.equal(data.totals.plannedRequestCount, 12);
  assert.equal(data.totals.requestCount, 1);
  assert.equal(data.totals.pendingRequestCount, 11);
  assert.equal(data.imageDetails.length, 6);
  assert.equal(data.modelSummaries.length, 2);
  assert.equal(data.modelSummaries[0].hitCount, 1);
  assert.equal(data.modelSummaries[0].scoreDenominator, 6);
  assert.equal(data.modelSummaries[0].hitRate, 1 / 6);
  assert.equal(data.modelSummaries[0].pendingRequests, 5);
  assert.equal(data.modelSummaries[1].scoreDenominator, 6);
  assert.equal(data.modelSummaries[1].pendingRequests, 6);
  const unstarted = data.imageDetails.find(
    (detail) => detail.modelId === 'unstarted',
  );
  assert.ok(unstarted);
  assert.equal(unstarted.overallSuccess, null);
  assert.equal(unstarted.accuracy, null);
  assert.deepEqual(unstarted.requests, []);
  assert.equal(data.imageDetails[0].overallSuccess, null);
  assert.equal(data.imageDetails[0].accuracy, 1 / 2);
  const rows = summarizeCategories(data);
  assert.deepEqual(
    rows
      .find((row) => row.platform === 'Web' && row.category === 'Basic')
      ?.scores.get('model'),
    { correct: 1, total: 2, pending: 1 },
  );
  assert.deepEqual(
    rows
      .find((row) => row.platform === 'Mobile' && row.category === 'Refusal')
      ?.scores.get('model'),
    { correct: 0, total: 4, pending: 4 },
  );
  assert.deepEqual(
    rows.find((row) => row.platform === 'All')?.scores.get('unstarted'),
    { correct: 0, total: 6, pending: 6 },
  );
});
