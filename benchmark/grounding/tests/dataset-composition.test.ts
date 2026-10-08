import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifest } from '../evaluation/runtime/load-data.js';
import { validateComposition } from '../scripts/validate-dataset.js';

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
