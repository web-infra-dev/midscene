import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { loadManifest } from '../evaluation/runtime/load-data.js';
import { datasetDir } from '../evaluation/runtime/paths.js';
import {
  type SourceImageRestoration,
  validateComposition,
  validateRestoredSourceImages,
  validateSourceTranslations,
} from '../scripts/validate-dataset.js';

test('primary-factor quotas cannot be replaced by legacy four-category counts', async () => {
  const manifest = await loadManifest();
  validateComposition(manifest);
  const changed = manifest.map((row) => ({ ...row }));
  const color = changed.find(
    (row) => row.platform === 'web' && row.primary_factor === 'color',
  )!;
  // Moving color to element leaves Basic's count unchanged but violates the quota.
  color.primary_factor = 'element';
  assert.throws(
    () => validateComposition(changed),
    /Wrong primary composition/,
  );
});

test('legacy display classes must agree with the primary factor', async () => {
  const manifest = await loadManifest();
  const changed = manifest.map((row) => ({ ...row }));
  const reasoning = changed.find((row) => row.primary_factor === 'reasoning')!;
  reasoning.task_class = 'basic';
  assert.throws(
    () => validateComposition(changed),
    /factor\/category mismatch/,
  );
});

test('Chinese source translations match the retained official records', async () => {
  validateSourceTranslations(await loadManifest());
});

test('copied Chinese text is rejected for both official record shapes', async () => {
  const manifest = await loadManifest();
  for (const field of ['raw_record', 'source_record'] as const) {
    const row = manifest.find(
      (item) =>
        item.source_name === 'VenusBench-GD' &&
        item[field]?.instruction_zh &&
        item[field]?.instruction_zh !== '关闭振动功能',
    )!;
    assert.throws(
      () => validateSourceTranslations([{ ...row, query_zh: '关闭振动功能' }]),
      new RegExp(`Source Chinese translation mismatch: ${row.case_name}`),
    );
  }
});

test('optional translations and locally supplied translations remain valid', async () => {
  const manifest = await loadManifest();
  const venus = manifest.find((row) => row.source_name === 'VenusBench-GD')!;
  const mmbench = manifest.find((row) => row.source_name === 'MMBench-GUI L2')!;
  assert.doesNotThrow(() =>
    validateSourceTranslations([
      { ...venus, query_zh: null },
      { ...venus, query_zh: '' },
      { ...mmbench, query_zh: '本地辅助翻译' },
    ]),
  );
});

async function loadRestoration() {
  return JSON.parse(
    await readFile(
      path.join(datasetDir, 'source-image-restoration.json'),
      'utf8',
    ),
  ) as SourceImageRestoration & {
    cases: { before: { image_sha256: string } }[];
  };
}

test('WebClick images match the pinned official PNG hashes', async () => {
  validateRestoredSourceImages(await loadManifest(), await loadRestoration());
});

test('JPEG hashes are rejected even when local declarations are updated', async () => {
  const restoration = await loadRestoration();
  const original = restoration.cases[0];
  const changed = (await loadManifest()).map((row) =>
    row.case_name === original.case_name
      ? { ...row, image_sha256: original.before.image_sha256 }
      : row,
  );
  assert.throws(
    () => validateRestoredSourceImages(changed, restoration),
    new RegExp(`Official source image mismatch: ${original.case_name}`),
  );
});

test('source image records must cover every case and preserve source identity', async () => {
  const manifest = await loadManifest();
  const restoration = await loadRestoration();
  assert.throws(
    () =>
      validateRestoredSourceImages(manifest, {
        ...restoration,
        cases: restoration.cases.slice(1),
      }),
    /Incomplete or duplicate WebClick source image records/,
  );
  const changed = manifest.map((row) =>
    row.case_name === restoration.cases[0].case_name
      ? { ...row, source_id: 'default/test/0' }
      : row,
  );
  assert.throws(
    () => validateRestoredSourceImages(changed, restoration),
    /Official source image mismatch/,
  );
});
