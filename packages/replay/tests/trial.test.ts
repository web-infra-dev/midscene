import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, rs } from '@rstest/core';
import { freezeSource } from '../scripts/evidence.mjs';
import { trial } from '../scripts/trial.mjs';
import * as io from '../src/io' with { rstest: 'importActual' };
import { readTrace } from '../src/recording/trace-io' with {
  rstest: 'importActual',
};
import { describeError } from '../src/verification/diagnostic' with {
  rstest: 'importActual',
};

rs.mock('../dist/es/tooling.mjs', () => ({
  readTrace,
  describeError,
  digest: io.sha256,
  writeJsonFile: io.writeJsonFile,
  imageBytes: (base64: string) => Buffer.from(base64, 'base64'),
}));
let root: string;
let session: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'replay-trial-'));
  mkdirSync(join(root, 'node_modules/@midscene'), { recursive: true });
  symlinkSync(
    fileURLToPath(new URL('../', import.meta.url)),
    join(root, 'node_modules/@midscene/replay'),
    'junction',
  );
  mkdirSync(join(root, 'source'));
  mkdirSync(join(root, 'authoring'));
  writeFileSync(
    join(root, 'source/trace.json'),
    JSON.stringify({ version: 1, start: { screen: 'https://example.test/' } }),
  );
  writeFileSync(join(root, 'source/frames.json'), '{}');
  writeFileSync(join(root, 'source/events.jsonl'), '');
  freezeSource(join(root, 'source'), join(root, 'authoring/source.json'));
  session = `
    export const platform='web';
    export async function reset(){}
    export async function verifyStart(){return true;}
    export const checks={final:async()=>({state:'pass',actual:{value:'expected'}})};
    export async function open(){
      const context={pages:()=>[page],on(){},off(){}};
      const page={url:()=>'https://example.test/',viewport:()=>({width:640,height:480}),context:()=>context,screenshot:async()=>Buffer.from('a')};
      const agent={interface:{underlyingPage:page,screenshotBase64:async()=>'YQ=='},dumpDataString:()=>JSON.stringify({executions:[{tasks:[]}]})};
      return {agent,close:async()=>{}};
    }
  `;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const experimental = JSON.stringify('@midscene/replay/experimental');
/** A one-step flow by default; step bodies can use `ctx.agent`. */
function setup(script = '', steps?: string) {
  writeFileSync(join(root, 'authoring/session.mjs'), session);
  writeFileSync(
    join(root, 'authoring/candidate.mjs'),
    `import {defineReplay,defineStep} from ${experimental};
    export default defineReplay({meta:{platform:'web'},steps:${
      steps ??
      `[defineStep({id:'script',title:'Script',retry:'never',run:async(rp,{agent})=>{${script}}})]`
    }});`,
  );
}
const run = (extra = {}) =>
  trial(join(root, 'authoring/candidate.mjs'), {
    session: join(root, 'authoring/session.mjs'),
    out: join(root, 'result'),
    ...extra,
  });
const result = () =>
  JSON.parse(readFileSync(join(root, 'result/result.json'), 'utf8'));
const report = () =>
  JSON.parse(readFileSync(join(root, 'result/run-1/report.json'), 'utf8'));
it('defaults to three fresh sessions with checks and exported evidence, leaving review to the Agent', async () => {
  setup();
  await run();
  expect(result()).toMatchObject({
    execution: 'passed',
    requestedRuns: 3,
    completedRuns: 3,
  });
  expect(result()).not.toHaveProperty('review');
  expect(report().checks).toEqual([
    { name: 'final', state: 'pass', actual: { value: 'expected' } },
  ]);
  expect(
    JSON.parse(readFileSync(join(root, 'result/run-1/agent.json'), 'utf8')),
  ).toEqual({ executions: [{ tasks: [] }] });
  expect(existsSync(join(root, 'result/run-3/terminal.png'))).toBe(true);
  expect(report().evidence).toEqual({ entries: [], images: 0 });
  expect(report().viewport).toEqual({ width: 640, height: 480 });
  expect(result().reports[0].evidence).toEqual({ images: 0 });
  expect(existsSync(join(root, 'result/run-1/evidence.md'))).toBe(false);
  expect(existsSync(join(root, 'result/run-1/evidence.json'))).toBe(false);
  expect(readFileSync(join(root, 'result/replay/candidate.mjs'), 'utf8')).toBe(
    readFileSync(join(root, 'authoring/candidate.mjs'), 'utf8'),
  );
});
it('retains an incidental diagnostic event without interpreting it as a business failure', async () => {
  setup(
    `const {channel}=await import('node:diagnostics_channel');channel('midscene.replay').publish({agent,event:{type:'action',action:'Tap',target:'container',dispatch:'completed'}});`,
  );
  await run();
  expect(
    report().events.find((event: { type: string }) => event.type === 'action'),
  ).toMatchObject({
    action: 'Tap',
    target: 'container',
  });
  expect(result().execution).toBe('passed');
});
it('fails real business checks, records all check results and stops further runs', async () => {
  session = session.replace(
    "final:async()=>({state:'pass',actual:{value:'expected'}})",
    'final:async()=>false,other:async()=>true',
  );
  setup();
  await expect(run({ runs: 2 })).rejects.toThrow('final: fail');
  expect(result().completedRuns).toBe(1);
  expect(
    report().checks.map((check: { state: string }) => check.state),
  ).toEqual(['fail', 'pass']);
  expect(report().terminal.image).toBe('terminal.png');
});
for (const state of ['pending', 'inconclusive', 'not_checked']) {
  it(`does not promote ${state} checks to passing`, async () => {
    session = session.replace("state:'pass'", `state:'${state}'`);
    setup();
    await expect(run()).rejects.toThrow(`final: ${state}`);
  });
}
it('keeps undefined results as errors instead of empty success', async () => {
  session = session.replace(
    "({state:'pass',actual:{value:'expected'}})",
    'undefined',
  );
  setup();
  await expect(run()).rejects.toThrow('final: error');
  expect(report().checks[0].error.message).toContain('CHECK_NO_RESULT');
});
it('preserves failed assertions and skips final checks when the script is incomplete', async () => {
  setup("throw Object.assign(new Error('wrong row'),{code:'ERR_ASSERTION'});");
  await expect(run()).rejects.toThrow('wrong row');
  expect(report().checks[0].state).toBe('not_checked');
  expect(report().errors[0]).toMatchObject({
    code: 'REPLAY_STEP_FAILED',
    stage: 'script',
    cause: { code: 'ERR_ASSERTION' },
  });
  expect(report().flow.steps[0]).toMatchObject({
    id: 'script',
    status: 'failed',
    attempts: [{ phase: 'run', dispatched: 0 }],
  });
  expect(existsSync(join(root, 'result/run-1/agent.json'))).toBe(true);
});
it('does not claim execution success after cleanup failures', async () => {
  session = session.replace(
    'close:async()=>{}',
    "close:async()=>{throw new Error('cleanup failed')}",
  );
  setup();
  await expect(run()).rejects.toThrow('cleanup failed');
  expect(report().checks[0].state).toBe('pass');
  expect(report().errors[0].stage).toBe('cleanup');
});
it('retains diagnostics when the initial state is wrong', async () => {
  session = session.replace(
    'verifyStart(){return true',
    'verifyStart(){return false',
  );
  setup();
  await expect(run()).rejects.toThrow('START_MISMATCH');
  expect(report().errors[0].stage).toBe('setup');
});
it('refuses mixed script versions and retains the executed source snapshot', async () => {
  setup(
    `const fs=await import('node:fs');fs.appendFileSync(${JSON.stringify(join(root, 'authoring/candidate.mjs'))},' //changed');`,
  );
  await expect(run()).rejects.toThrow('TRIAL_INPUTS_CHANGED');
  expect(result().execution).toBe('failed');
});
it('protects original evidence even though it no longer compares events', async () => {
  setup(
    `const fs=await import('node:fs');fs.appendFileSync(${JSON.stringify(join(root, 'source/events.jsonl'))},' ');`,
  );
  await expect(run()).rejects.toThrow('SOURCE_CHANGED');
});
it('fails invalid counts before running', async () => {
  setup();
  await expect(run({ runs: 0 })).rejects.toThrow('positive integer');
});

it('indexes first-class steps, retries and one-run fallback diagnostics', async () => {
  setup(
    '',
    `[
      defineStep({id:'search',title:'搜索',run:async(rp,{agent})=>{
        const {channel}=await import('node:diagnostics_channel');
        const stream=channel('midscene.replay');
        const step={number:1,id:'search',title:'搜索',attempt:1};
        stream.publish({agent,event:{type:'fallback',step,prompt:'搜索框',original:{code:'TARGET_MISSING'},result:'resolved',resolvedBy:'guard',suggestions:['//input[@name="q"]'],durationMs:120}});
        stream.publish({agent,event:{type:'checkpoint',step,title:'查到结果',actual:{count:1},status:'passed'}});
      }}),
      defineStep({id:'flaky',title:'第二步',run:async(rp,ctx)=>{
        ctx.state.tries=(ctx.state.tries??0)+1;
        if(ctx.state.tries===1) throw new Error('not ready yet');
      }}),
      defineStep({id:'later',title:'第三步',run:async()=>{}}),
    ]`,
  );
  await expect(run()).rejects.toThrow('FALLBACK_IN_STRICT_TRIAL');
  expect(report().fallbacks).toHaveLength(1);
  const diagnostic = join(root, 'diagnostic');
  await run({ out: diagnostic, runs: 1, allowFallback: true });
  const summary = JSON.parse(
    readFileSync(join(diagnostic, 'result.json'), 'utf8'),
  );
  expect(summary.steps.map((step: { id: string }) => step.id)).toEqual([
    'search',
    'flaky',
    'later',
  ]);
  expect(summary.inputDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(summary.snapshotScope).toBe('entry-and-steps');
  expect(summary.steps[0]).not.toHaveProperty('hash');
  const runReport = JSON.parse(
    readFileSync(join(diagnostic, 'run-1/report.json'), 'utf8'),
  );
  expect(runReport.retries).toBe(1);
  expect(
    runReport.flow.steps[1].attempts.map((a: { status: string }) => a.status),
  ).toEqual(['failed', 'passed']);
  const markdown = readFileSync(join(diagnostic, 'steps.md'), 'utf8');
  expect(markdown).toContain('id="step-1"');
  expect(markdown).toContain('## 2. 第二步 (`flaky`)');
  expect(markdown).toContain(
    'Run 1: passed (2 attempt(s); attempt 1 failed in run',
  );
  expect(markdown).toMatch(/Attempt 1 timing: run \d+ ms \(total \d+ ms\)/);
  expect(markdown).toMatch(/Attempt 2 timing: run \d+ ms \(total \d+ ms\)/);
  expect(markdown).toContain('Fallback guard: resolved (120 ms)');
  expect(markdown).toContain('{"count":1}');
  expect(existsSync(join(diagnostic, 'run-1/review.png'))).toBe(true);
  expect(
    JSON.parse(readFileSync(join(diagnostic, 'heal.json'), 'utf8')),
  ).toEqual([
    expect.objectContaining({
      run: 1,
      original: 'TARGET_MISSING',
      resolvedBy: 'guard',
      suggestions: ['//input[@name="q"]'],
    }),
  ]);

  // Focus: earlier steps run normally, the flow stops after the focused step.
  const focused = join(root, 'focused');
  const focusedResult = await run({
    out: focused,
    runs: 1,
    allowFallback: true,
    step: 'flaky',
  });
  expect(focusedResult).toMatchObject({ mode: 'focus', execution: 'passed' });
  const focusedReport = JSON.parse(
    readFileSync(join(focused, 'run-1/report.json'), 'utf8'),
  );
  expect(
    focusedReport.flow.steps.map((s: { status: string }) => s.status),
  ).toEqual(['passed', 'passed', 'not-run']);
  expect(focusedReport.checks).toEqual([
    { name: 'final', state: 'not_checked', reason: expect.any(String) },
  ]);
  await expect(
    run({ out: join(root, 'invalid'), allowFallback: true }),
  ).rejects.toThrow('diagnostics only');
});

it('numbers trials inside a prepared workspace when --out is omitted', async () => {
  setup();
  const first = await trial(join(root, 'authoring/candidate.mjs'), {
    session: join(root, 'authoring/session.mjs'),
    runs: 1,
  });
  const second = await trial(join(root, 'authoring/candidate.mjs'), {
    session: join(root, 'authoring/session.mjs'),
    runs: 1,
  });
  expect(first.execution).toBe('passed');
  expect(second.execution).toBe('passed');
  expect(existsSync(join(root, 'authoring/trials/01/result.json'))).toBe(true);
  expect(existsSync(join(root, 'authoring/trials/02/result.json'))).toBe(true);
});

it('treats a replay folder with step modules as one versioned unit', async () => {
  writeFileSync(join(root, 'authoring/session.mjs'), session);
  mkdirSync(join(root, 'authoring/replay/steps'), { recursive: true });
  writeFileSync(
    join(root, 'authoring/replay/shared.mjs'),
    "export const value = 'one';",
  );
  writeFileSync(
    join(root, 'authoring/replay/steps/first.mjs'),
    `import {defineStep} from ${experimental};
    import {value} from '../shared.mjs';
    export default defineStep({id:'first',title:'第一步',run:()=>value});`,
  );
  writeFileSync(
    join(root, 'authoring/replay/index.mjs'),
    `import {defineReplay,defineStep} from ${experimental};
    import first from './steps/first.mjs';
    export default defineReplay({meta:{platform:'web'},steps:[first,
      defineStep({id:'second',title:'第二步',run:(rp,ctx)=>{if(ctx.results.first!=='one')throw new Error('lost result')}})]});`,
  );
  const summary = await trial(join(root, 'authoring/replay'), {
    session: join(root, 'authoring/session.mjs'),
    runs: 1,
  });
  expect(summary.execution).toBe('passed');
  expect(summary.snapshotScope).toBe('replay-directory');
  expect(summary.steps.map((step: { id: string }) => step.id)).toEqual([
    'first',
    'second',
  ]);
  expect(summary.inputs.map((input: { path: string }) => input.path)).toEqual([
    'replay/index.mjs',
    'replay/shared.mjs',
    'replay/steps/first.mjs',
    'session/session.mjs',
  ]);
  expect(
    existsSync(join(root, 'authoring/trials/01/replay/steps/first.mjs')),
  ).toBe(true);
  expect(
    readFileSync(join(root, 'authoring/trials/01/replay/shared.mjs'), 'utf8'),
  ).toBe("export const value = 'one';");
});

it('changes the bundle digest when a module constant changes across trial groups', async () => {
  setup();
  const hashes = [];
  for (const value of ['draft', 'changed']) {
    const bundle = join(root, 'authoring', value);
    mkdirSync(bundle);
    writeFileSync(
      join(bundle, 'index.mjs'),
      `import {defineReplay,defineStep} from ${experimental};
      const message = ${JSON.stringify(value)};
      export default defineReplay({meta:{platform:'web'},steps:[
        defineStep({id:'draft',title:'Draft',run:()=>message}),
      ]});`,
    );
    const summary = await trial(bundle, {
      session: join(root, 'authoring/session.mjs'),
      runs: 1,
    });
    expect(summary.execution).toBe('passed');
    expect(summary.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    hashes.push(summary.inputDigest);
  }
  expect(hashes[0]).not.toBe(hashes[1]);
});

it('freezes the same renamed bundle through its directory or entry file', async () => {
  setup();
  const bundle = join(root, 'authoring/renamed');
  mkdirSync(bundle);
  const entry = join(bundle, 'index.mjs');
  writeFileSync(entry, readFileSync(join(root, 'authoring/candidate.mjs')));
  writeFileSync(join(bundle, 'helper.mjs'), 'export const value = 1;');
  const [directory, file] = await Promise.all(
    [bundle, entry].map((input, index) =>
      trial(input, {
        session: join(root, 'authoring/session.mjs'),
        out: join(root, `range-${index}`),
        runs: 1,
      }),
    ),
  );
  expect(file.snapshotScope).toBe('replay-directory');
  expect(file.inputDigest).toBe(directory.inputDigest);
  expect(file.inputs.map((input) => input.path)).toContain('replay/helper.mjs');
});

it('rejects a transitive local import outside the replay directory before execution', async () => {
  const bundle = join(root, 'authoring/renamed');
  mkdirSync(join(bundle, 'steps'), { recursive: true });
  writeFileSync(join(bundle, 'index.mjs'), "import './steps/first.mjs';");
  writeFileSync(join(bundle, 'steps/first.mjs'), "import '../../outside.mjs';");
  writeFileSync(
    join(root, 'authoring/outside.mjs'),
    "throw new Error('outside module ran');",
  );
  setup();
  const out = join(root, 'result');
  await expect(
    trial(bundle, { session: join(root, 'authoring/session.mjs'), out }),
  ).rejects.toThrow(/TRIAL_IMPORT_OUTSIDE_ROOT.*outside\.mjs/);
  expect(result()).toMatchObject({ execution: 'failed', completedRuns: 0 });
});

it('rejects a local session import outside the session directory before execution', async () => {
  const folder = join(root, 'host');
  mkdirSync(folder);
  const host = join(folder, 'session.mjs');
  writeFileSync(join(root, 'foreign.mjs'), '');
  writeFileSync(
    host,
    session.replace(
      'export async function reset(){}',
      "export async function reset(){await import('../foreign.mjs');}",
    ),
  );
  setup();
  await expect(run({ session: host })).rejects.toThrow(
    /TRIAL_IMPORT_OUTSIDE_ROOT.*foreign\.mjs/,
  );
  expect(result()).toMatchObject({ execution: 'failed', completedRuns: 0 });
});

for (const change of ['add', 'edit', 'delete']) {
  it(`fails a bundle trial when a shared file changes during execution (${change})`, async () => {
    const bundle = join(root, 'authoring/replay');
    const helper = join(bundle, 'shared.json');
    const out = join(root, 'result');
    mkdirSync(bundle);
    if (change !== 'add') writeFileSync(helper, '"before"');
    const mutate =
      change === 'delete'
        ? `fs.unlinkSync(${JSON.stringify(helper)})`
        : `fs.writeFileSync(${JSON.stringify(helper)}, '"after"')`;
    setup(`const fs = await import('node:fs'); ${mutate};`);
    const entry = join(bundle, 'index.mjs');
    writeFileSync(entry, readFileSync(join(root, 'authoring/candidate.mjs')));

    await expect(
      trial(entry, {
        session: join(root, 'authoring/session.mjs'),
        out,
      }),
    ).rejects.toThrow('TRIAL_INPUTS_CHANGED');
    expect(result()).toMatchObject({
      execution: 'failed',
      completedRuns: 1,
      snapshotScope: 'replay-directory',
    });
    const frozenHelper = join(out, 'replay/shared.json');
    if (change === 'add') expect(existsSync(frozenHelper)).toBe(false);
    else expect(readFileSync(frozenHelper, 'utf8')).toBe('"before"');
  });
}
