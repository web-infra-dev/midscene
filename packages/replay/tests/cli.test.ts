import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from '@rstest/core';

const cli = resolve(__dirname, '../scripts/cli.mjs');
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'replay-cli-'));
  mkdirSync(join(root, 'recording'));
  writeFileSync(
    join(root, 'recording/trace.json'),
    JSON.stringify({ version: 1, start: { screen: 'https://example.test/' } }),
  );
  writeFileSync(join(root, 'recording/events.jsonl'), '');
  writeFileSync(join(root, 'recording/frames.json'), '{}');
  writeFileSync(join(root, 'recording/brief.md'), 'original index');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(
    process.execPath,
    [
      cli,
      'prepare',
      join(root, 'recording'),
      '--out',
      join(root, 'authoring'),
      ...args,
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } },
  );
}
it('prepares instructions from the bundled skill with optional intent without changing original evidence', () => {
  const result = run([]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('SKILL.md');
  expect(result.stdout).toContain('Infer a specific business goal');
  expect(readdirSync(join(root, 'authoring')).sort()).toEqual([
    'acceptance.md',
    'brief.md',
    'node_modules',
    'package.json',
    'scratch',
    'source.json',
  ]);
  expect(readFileSync(join(root, 'recording/brief.md'), 'utf8')).toBe(
    'original index',
  );
  expect(
    JSON.parse(readFileSync(join(root, 'authoring/source.json'), 'utf8')).files[
      'events.jsonl'
    ],
  ).toHaveLength(64);
});
it('preserves explicit intent', () => {
  const goal = '保留用户输入 "$q"';
  const result = run(['--goal', goal]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(goal);
});
it('rejects blank intent', () => {
  const result = run(['--goal', ' ']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('omit it');
});

it.each([
  [['browser', 'chromium'], 'browser expects chrome or msedge'],
  [['browser', 'msedge', '--port', '65536'], '--port expects an integer'],
  [['browser', 'chrome', '--url', 'file:///tmp/start'], 'INVALID_START_URL'],
  [['run', 'replay.mjs', '--port', '9222'], '--port is supported by browser'],
  [['trial', 'replay.mjs', '--reuse-tab'], '--reuse-tab requires trial --cdp'],
])('rejects invalid dedicated browser arguments %j', (args, message) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
});

it('refuses generated files inside the immutable source recording', () => {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'prepare',
      join(root, 'recording'),
      '--out',
      join(root, 'recording/generated'),
    ],
    { cwd: root, encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('outside the immutable recording');
});

it('runs one script with a custom session and retains dispatch facts when the report fails', () => {
  const script = join(root, 'candidate.mjs');
  const session = join(root, 'session.mjs');
  writeFileSync(
    script,
    `
    import {channel} from 'node:diagnostics_channel';
    import {defineReplay,defineStep} from ${JSON.stringify(new URL('../dist/es/experimental.mjs', `file://${__dirname}/`).href)};
    export default defineReplay({
      meta: {platform:'web'},
      steps: [defineStep({id:'click',title:'Click',retry:'never',run:async(rp,{agent})=>{
        await agent.click();
        channel('midscene.replay').publish({agent,event:{type:'action',action:'Tap',dispatch:'completed'}});
      }})],
    });
  `,
  );
  writeFileSync(
    session,
    `
    import {appendFileSync} from 'node:fs';
    export const platform='web';
    export async function open() {
      return {
        agent:{
          click:async()=>appendFileSync('calls','click\\n'),
          flushReport:async()=>{throw new Error('fixture report error')},
        },
        close:async()=>appendFileSync('calls','close\\n'),
      };
    }
    export async function reset(){}
    export async function verifyStart(){return true}
  `,
  );
  const result = spawnSync(
    process.execPath,
    [cli, 'run', script, '--session', session, '--out', join(root, 'run')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  expect(result.status).toBe(1);
  expect(readFileSync(join(root, 'calls'), 'utf8')).toBe('click\nclose\n');
  expect(
    JSON.parse(readFileSync(join(root, 'run/result.json'), 'utf8')),
  ).toMatchObject({
    execution: 'failed',
    business: 'passed',
    actions: [{ action: 'Tap', dispatch: 'completed' }],
    flow: { status: 'passed', steps: [{ id: 'click', status: 'passed' }] },
    errors: [{ stage: 'report', message: 'Error: fixture report error' }],
  });
});

it('skips whole-flow checks for partial runs and enforces them for the complete range', () => {
  const script = join(root, 'candidate.mjs');
  const session = join(root, 'session.mjs');
  writeFileSync(
    script,
    `import {defineReplay,defineStep} from ${JSON.stringify(new URL('../dist/es/experimental.mjs', `file://${__dirname}/`).href)};
    const step = (id) => defineStep({id, title:id, ready:() => {}, run:(_rp,{agent})=>agent.record(id)});
    export default defineReplay({meta:{platform:'web'},steps:[step('draft'),step('publish')]});`,
  );
  writeFileSync(
    session,
    `import {appendFileSync} from 'node:fs';
    const record = (name) => appendFileSync('calls', name+'\\n');
    export const platform='web';
    export async function open(){ return {agent:{record},close:async()=>{}}; }
    export async function reset(){}
    export async function verifyStart(){return true}
    export const checks={published:async()=>{record('check');return false;}};`,
  );

  const execute = (name: string, ...range: string[]) => {
    const out = join(root, name);
    const child = spawnSync(
      process.execPath,
      [cli, 'run', script, '--session', session, '--out', out, ...range],
      { cwd: root, encoding: 'utf8' },
    );
    return {
      exit: child.status,
      result: JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')),
    };
  };
  for (const [name, arg, id] of [
    ['prefix', '--until', 'draft'],
    ['suffix', '--from', 'publish'],
  ]) {
    const partial = execute(name, arg, id);
    expect(partial.exit).toBe(0);
    expect(partial.result).toMatchObject({
      mode: 'partial',
      execution: 'passed',
      business: 'not-checked',
      checks: [
        { name: 'published', state: 'not_checked', reason: expect.any(String) },
      ],
    });
  }
  expect(readFileSync(join(root, 'calls'), 'utf8')).toBe('draft\npublish\n');

  const full = execute('full', '--from', '1', '--until', 'publish');
  expect(full.exit).toBe(1);
  expect(full.result).toMatchObject({
    mode: 'full',
    execution: 'failed',
    business: 'check-failed',
    checks: [{ name: 'published', state: 'fail' }],
  });
  expect(readFileSync(join(root, 'calls'), 'utf8')).toBe(
    'draft\npublish\ndraft\npublish\ncheck\n',
  );
});

it('runs just one step from a custom session with a prepared entry and explicit input', () => {
  const script = join(root, 'candidate.mjs');
  const session = join(root, 'session.mjs');
  const out = join(root, 'single-step');
  writeFileSync(
    script,
    `import assert from 'node:assert/strict';
    import {defineReplay,defineStep} from ${JSON.stringify(new URL('../dist/es/experimental.mjs', import.meta.url).href)};
    const unexpected = () => { throw new Error('Outside selected range'); };
    export default defineReplay({meta:{platform:'web',startUrl:'https://example.test/',ready:{xpath:'//main[@id="home"]',timeoutMs:0}},steps:[
      defineStep({id:'find',title:'Find',run:unexpected}),
      defineStep({
        id:'open',title:'Open',
        async ready(rp,{params}) {
          assert.equal(await rp.read(() => location.pathname), '/results');
          assert.equal(params.itemId, 'item-1');
        },
        run(_rp,{agent,params,results,state}) {
          assert.deepEqual(results, {});
          assert.deepEqual(state, {});
          agent.pathname = '/items/' + params.itemId;
        },
        async done(rp) {
          assert.equal(await rp.read(() => location.pathname), '/items/item-1');
        },
      }),
      defineStep({id:'submit',title:'Submit',run:unexpected}),
    ]});`,
  );
  writeFileSync(
    session,
    `export const platform='web';
    export function getParams(){ return {itemId:'item-1'}; }
    export function open() {
      const agent = { evaluateJavaScript: async () => agent.pathname };
      return {agent,close:async()=>{}};
    }
    export function reset(agent) { agent.pathname = '/results'; }
    export function verifyStart(agent) { return agent.pathname === '/results'; }`,
  );
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'run',
      script,
      '--session',
      session,
      '--out',
      out,
      '--from',
      'open',
      '--until',
      'open',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  expect(result.status).toBe(0);
  expect(
    JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')),
  ).toMatchObject({
    execution: 'passed',
    business: 'not-checked',
    flow: {
      steps: [
        { id: 'find', status: 'skipped' },
        {
          id: 'open',
          status: 'passed',
          attempts: [
            {
              phaseMs: {
                ready: expect.any(Number),
                run: expect.any(Number),
                done: expect.any(Number),
              },
            },
          ],
        },
        { id: 'submit', status: 'not-run' },
      ],
    },
  });
});

it('retains the selected mode on startup and execution failures', () => {
  const script = join(root, 'candidate.mjs');
  const session = join(root, 'session.mjs');
  writeFileSync(
    script,
    `import {defineReplay,defineStep} from ${JSON.stringify(new URL('../dist/es/experimental.mjs', import.meta.url).href)};
    export default defineReplay({meta:{platform:'web'},steps:['first','middle','last'].map(id=>defineStep({
      id,title:id,retry:'never',ready(){},run(){if(id==='middle') throw new Error('fixture failure');}
    }))});`,
  );
  writeFileSync(
    session,
    `export const platform='web';
    export function open(){return {agent:{},close(){}};}
    export function reset(){}
    export function verifyStart(){return process.env.REPLAY_FIXTURE_READY === 'yes';}
    export const checks={final(){return true;}};`,
  );
  for (const [name, mode, ready, ...range] of [
    ['default-full', 'full', 'yes'],
    ['explicit-full', 'full', 'yes', '--from', 'first', '--until', 'last'],
    ['partial', 'partial', 'yes', '--until', 'middle'],
    ['setup-failed', 'partial', 'no', '--from', 'middle'],
  ]) {
    const out = join(root, name);
    const child = spawnSync(
      process.execPath,
      [cli, 'run', script, '--session', session, '--out', out, ...range],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, REPLAY_FIXTURE_READY: ready },
      },
    );
    expect(child.status).toBe(1);
    expect(
      JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')),
    ).toMatchObject({
      mode,
      execution: 'failed',
      business: 'not-completed',
      checks: [{ name: 'final', state: 'not_checked' }],
      errors: [{ stage: ready === 'yes' ? 'script' : 'application-ready' }],
    });
  }
  writeFileSync(session, "throw new Error('fixture session import failed');");
  const out = join(root, 'import-failed');
  const child = spawnSync(
    process.execPath,
    [
      cli,
      'run',
      script,
      '--session',
      session,
      '--out',
      out,
      '--until',
      'middle',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  expect(child.status).toBe(1);
  expect(
    JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')),
  ).toMatchObject({
    mode: 'partial',
    execution: 'failed',
    errors: [
      { stage: 'setup', message: 'Error: fixture session import failed' },
    ],
  });
});
