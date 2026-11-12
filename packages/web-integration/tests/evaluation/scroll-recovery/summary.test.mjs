import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quantile, summarize, validateRun } from './summary.mjs';
const record = (id, arm, success, rep = 0) => ({
  id,
  arm,
  success,
  rep,
  caseId: 'same',
  family: 'right',
  split: 'development',
  track: 'natural',
  compliant: true,
  reviews: [],
  calls: [],
  tokens: 0,
  actions: [],
  durationMs: 100,
  noProgressScrolls: 0,
});
test('keeps failed attempts and service errors in the denominator', () => {
  const failed = {
    ...record('b', 2, false),
    error: '429 rate limit',
    calls: [{ synthetic: true }, { synthetic: false }],
  };
  const result = summarize([record('a', 0, true), failed]);
  const group = result.groups['natural/development/2'];
  assert.equal(group.attempts, 1);
  assert.equal(group.successRate, 0);
  assert.equal(group.serviceFailures, 1);
  assert.equal(group.realCalls, 1);
  assert.equal(result.comparisons['natural/2-vs-0'].delta, -1);
});
test('pairs by repetition and clusters repeated layouts', () => {
  const r = summarize([
    record('a', 0, true),
    record('b', 2, false),
    record('c', 0, false, 1),
    record('d', 2, true, 1),
  ]).comparisons['natural/2-vs-0'];
  assert.equal(r.pairedAttempts, 2);
  assert.equal(r.scenarios, 1);
  assert.equal(r.delta, 0);
});
test('rejects duplicate attempt identifiers', () => {
  assert.throws(
    () => summarize([record('same', 0, true), record('same', 0, true)]),
    /Duplicate/,
  );
});

test('rejects partial or substituted schedules even when counts match', () => {
  const manifest = {
    track: 'natural',
    jobs: [
      { case: 'same', arm: 0, rep: 0 },
      { case: 'same', arm: 2, rep: 0 },
    ],
  };
  assert.throws(
    () => validateRun(manifest, [record('a', 0, true)]),
    /Incomplete/,
  );
  assert.throws(
    () => validateRun(manifest, [record('a', 0, true), record('b', 3, true)]),
    /Unexpected/,
  );
  assert.doesNotThrow(() =>
    validateRun(manifest, [record('a', 0, true), record('b', 2, false)]),
  );
});

test('reports the midpoint median for even sample sizes', () => {
  assert.equal(quantile([200, 100], 0.5), 150);
  assert.equal(quantile([], 0.5), null);
});

test('counts a completed explicit scroll goal without requiring a click marker', () => {
  const r = {
    ...record('scroll', 3, true),
    family: 'explicit',
    initial: { y: 0 },
    final: { y: 400, clicks: [] },
  };
  const group = summarize([r]).groups['natural/development/3'];
  assert.equal(group.goalReachedBeforeExit, 1);
  assert.equal(group.explicitInstructionViolations, 0);
});

test('retains recovered provider errors without classifying a completed task as failed', () => {
  const successful = {
    ...record('recovered', 3, true),
    calls: [
      { error: '429 TPM exceeded', synthetic: false },
      { synthetic: false },
    ],
  };
  const group = summarize([successful]).groups['natural/development/3'];
  assert.equal(group.passed, 1);
  assert.equal(group.serviceFailures, 0);
  assert.equal(group.attemptsWithServiceErrors, 1);
});
