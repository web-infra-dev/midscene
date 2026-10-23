import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Controller } from '../src/controller.mjs';
import { diagnose } from '../src/diagnosis.mjs';
import { evaluate } from '../src/evaluation.mjs';
import { executionErrorCode } from '../src/execution-error.mjs';
import {
  fakeGitHub,
  passingRunner,
  payload,
  policy,
  sha,
  temporary,
} from './helpers.mjs';
const corpus = JSON.parse(
  await readFile(new URL('../evaluation/cases.json', import.meta.url)),
);
const run = (observations) => ({
  corpusVersion: '1.0',
  engineSha: sha,
  plannerModel: 'pinned-planner',
  visualModel: 'pinned-visual',
  observations,
});
const observation = (caseId, outcome) => ({
  caseId,
  outcome,
  attempt: 1,
  evidence: 'fixture://not-real-model-evidence',
  durationMs: 10,
});

test('evaluation retains false positives, false negatives, abstentions and missing cases', () => {
  const result = evaluate(
    corpus,
    run([
      observation('save-working', 'assertion-failed'),
      observation('persistence-broken', 'passed'),
      observation('empty-input-working', 'inconclusive'),
      observation('preview-unavailable', 'passed'),
    ]),
  );
  assert.equal(result.falsePositiveRate, 0.5);
  assert.equal(result.falseNegativeRate, 1);
  assert.equal(result.inconclusive, 1);
  assert.equal(result.unexpectedDecision, 1);
  assert.equal(result.missing.length, 4);
  assert.equal(result.complete, false);
  assert.equal(evaluate(corpus, run([])).falseNegativeRate, null);
});

test('evaluation rejects unknown cases, retries, duplicate observations and missing provenance', () => {
  const first = observation('save-working', 'passed');
  assert.throws(() => evaluate(corpus, run([first, first])), /repeated/);
  assert.throws(
    () => evaluate(corpus, run([{ ...first, attempt: 2 }])),
    /First attempt/,
  );
  assert.throws(
    () => evaluate(corpus, run([{ ...first, caseId: 'invented' }])),
    /Unknown/,
  );
  assert.throws(
    () => evaluate(corpus, { ...run([first]), engineSha: null }),
    /Pinned/,
  );
});

test('failure classification distinguishes actions, assertions, navigation and nested provider errors', () => {
  assert.equal(
    executionErrorCode(new Error('Could not complete action'), 'aiAct'),
    'ACTION_EXECUTION_FAILED',
  );
  assert.equal(
    executionErrorCode(new Error('Assertion failed'), 'aiAssert'),
    'STEP_EXECUTION_FAILED',
  );
  assert.equal(
    executionErrorCode(new Error('navigation timeout'), 'navigation'),
    'ENVIRONMENT_ERROR',
  );
  assert.equal(
    executionErrorCode(
      new Error('wrapped', { cause: new Error('AI model request failed') }),
      'aiAssert',
    ),
    'MODEL_SERVICE_ERROR',
  );
});

for (const [category, change] of [
  ['passed', () => {}],
  [
    'planning-incomplete',
    (r) => {
      r.planning = { status: 'needs-clarification' };
      r.execution.status = 'planning-blocked';
      r.functionalGate.status = 'not-satisfied';
    },
  ],
  [
    'execution-error',
    (r) => {
      r.execution.status = 'error';
      r.execution.errorCode = 'ENVIRONMENT_ERROR';
    },
  ],
  [
    'action-incomplete',
    (r) => {
      r.execution.status = 'error';
      r.execution.errorCode = 'ACTION_EXECUTION_FAILED';
    },
  ],
  [
    'assertion-failed',
    (r) => {
      r.criteria = [
        { id: 'AC-1', status: 'failed', errorCode: 'STEP_EXECUTION_FAILED' },
      ];
    },
  ],
  [
    'revision-mismatch',
    (r) => {
      r.execution.observedRevisionBefore = 'b'.repeat(40);
    },
  ],
  [
    'evidence-incomplete',
    (r) => {
      r.functionalGate.status = 'not-satisfied';
    },
  ],
])
  test(`diagnosis: ${category}`, () => {
    const report = {
      subject: { headSha: sha },
      functionalGate: { status: 'satisfied', blockingReasons: [] },
      execution: { status: 'completed' },
      criteria: [],
    };
    change(report);
    assert.equal(diagnose(report).category, category);
  });

test('an action failure publishes Inconclusive in fixed-policy mode instead of a product failure', async (t) => {
  const { store } = await temporary(t);
  const github = fakeGitHub();
  const controller = new Controller({
    github,
    store,
    policies: [policy],
    publicUrl: 'https://verify.example.com',
    runner: async (input) => {
      const result = await passingRunner(input);
      result.status = 'error';
      result.errorCode = 'ACTION_EXECUTION_FAILED';
      result.criteria[0] = {
        id: 'AC-1',
        status: 'not-run',
        errorCode: 'ACTION_EXECUTION_FAILED',
        steps: [{ type: 'aiAct', status: 'failed' }],
      };
      return result;
    },
  });
  await controller.handle('pull_request', payload, 'action-failure');
  assert.equal(
    github.calls.filter((c) => c.body?.conclusion).at(-1).body.conclusion,
    'action_required',
  );
  assert.match(github.state.comments[0].body, /Inconclusive/);
  assert.match(github.state.comments[0].body, /action-incomplete/);
});
