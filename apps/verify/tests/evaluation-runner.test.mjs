import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fixtureApi, notesHtml, scenario } from '../evaluation/fixtures.mjs';
import { outcomeOf, runEvaluation } from '../evaluation/run.mjs';
import { collectContext } from '../src/context.mjs';

// Independent fixture oracle: execute the page's application script, without
// model prompts or report verdicts, to check the corpus labels before AI runs.
function editor(options) {
  const elements = Object.fromEntries(
    ['note', 'status', 'notes', 'save', 'reload'].map((id) => [
      id,
      {
        value: '',
        children: [],
        replaceChildren(...children) {
          this.children = children;
        },
      },
    ]),
  );
  const storage = new Map();
  vm.runInNewContext(
    notesHtml(options).match(/<script>([\s\S]*)<\/script>/)[1],
    {
      document: {
        getElementById: (id) => elements[id],
        createElement: () => ({ textContent: '' }),
      },
      localStorage: {
        getItem: (key) => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
    },
  );
  return elements;
}

test('fixture oracle independently distinguishes saved, persisted and invalid notes', () => {
  for (const persist of [true, false]) {
    const ui = editor({ persist });
    ui.note.value = 'Acceptance note';
    ui.save.onclick();
    assert.equal(ui.status.textContent, 'Saved successfully');
    assert.equal(ui.notes.children[0].textContent, 'Acceptance note');
    ui.reload.onclick();
    assert.equal(ui.notes.children.length, persist ? 1 : 0);
  }
  const ui = editor();
  for (const value of ['', '   ']) {
    ui.note.value = value;
    ui.save.onclick();
    assert.equal(ui.status.textContent, 'Enter a note before saving');
    assert.equal(ui.notes.children.length, 0);
  }
  assert.match(
    scenario('visible-validation-working').html,
    /<p id="status">Enter a note before saving<\/p>/,
  );
  assert.throws(() => scenario('unknown'), /Unknown fixture/);
});

test('fixture context goes through the production collector without expected labels', async () => {
  const fixture = scenario('persistence-broken');
  const context = await collectContext({
    ...fixtureApi(fixture.html, fixture.demand, 'a'.repeat(40)),
    policy: { repository: 'local/evaluation', planning: {} },
  });
  assert.ok(
    context.sources.some(
      (source) =>
        source.kind === 'head-code' && source.content === fixture.html,
    ),
  );
  assert.ok(
    context.sources.some(
      (source) =>
        source.kind === 'pull-request' &&
        source.content.includes(fixture.demand),
    ),
  );
  assert.equal(JSON.stringify(context).includes('persistence-broken'), false);
  assert.equal(JSON.stringify(context).includes('defective'), false);
  assert.deepEqual(context.limitations, []);
});

test('runner records every first attempt, rejects overwrites, and never counts planner outages as boundary success', async (t) => {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), 'verify-evaluation-test-'),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  let plans = 0;
  let executions = 0;
  const options = {
    root: path.join(parent, 'run'),
    origin: 'http://127.0.0.1:1234',
    engineSha: 'a'.repeat(40),
    plannerModel: 'unit-test',
    visualModel: 'unit-test',
    planner: async () => {
      plans++;
      throw new Error('private-provider-details');
    },
    runner: async () => {
      executions++;
      return { status: 'error', criteria: [] };
    },
  };
  const result = await runEvaluation(options);
  assert.equal(plans, 5);
  assert.equal(executions, 3);
  assert.equal(result.run.observations.length, 8);
  assert.equal(result.passed, false);
  assert.ok(result.boundaryMismatches.includes('ambiguous-demand'));
  assert.equal(result.harnessErrors.length, 5);
  assert.equal(result.metrics.falsePositive, 0);
  assert.equal(result.metrics.falseNegative, 0);
  assert.equal(
    (
      await readFile(path.join(options.root, 'save-working/error.json'), 'utf8')
    ).includes('private-provider-details'),
    false,
  );
  await assert.rejects(runEvaluation(options), /EEXIST/);
  assert.equal(plans, 5);
});

test('only an observed assertion or a satisfied gate becomes a decisive outcome', () => {
  assert.equal(
    outcomeOf({
      diagnosis: { category: 'action-incomplete' },
      functionalGate: { status: 'not-satisfied' },
    }),
    'inconclusive',
  );
  assert.equal(
    outcomeOf({
      diagnosis: { category: 'assertion-failed' },
      functionalGate: { status: 'not-satisfied' },
    }),
    'assertion-failed',
  );
  assert.equal(
    outcomeOf({
      diagnosis: { category: 'passed' },
      functionalGate: { status: 'satisfied' },
    }),
    'passed',
  );
});
