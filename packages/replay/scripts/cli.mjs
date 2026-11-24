#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateCdp } from './browser.mjs';

const help = [
  'Midscene Replay - use the bundled skill in your current coding Agent.',
  '  record web --url URL --out NEW_RECORDING [--browser chrome|msedge|chromium | --cdp BROWSER]',
  '    Recording defaults to a new Chrome window with an isolated profile.',
  '  browser chrome|msedge [--port PORT] [--url URL] (macOS; persistent Replay profile, default port 9222)',
  '  prepare RECORDING --out NEW_WORKSPACE [--goal TEXT]',
  '  run REPLAY [--session SESSION | --cdp BROWSER] [--headed] [--out NEW_DIR] [--from STEP] [--until STEP]',
  '  trial REPLAY [--session SESSION | --cdp BROWSER [--reuse-tab]] [--out NEW_DIR] [--headed] [--runs N] [--source SOURCE_MANIFEST]',
  '    --cdp accepts msedge, chrome or a local HTTP/WS CDP endpoint. Open the exact start URL first.',
  '    Trial copies login state into fresh contexts by default. --reuse-tab keeps one live tab for all rounds.',
  '    Without --out, a prepared workspace writes to WORKSPACE/trials/NN.',
  '  trial REPLAY --step STEP [--runs N] (focus: run earlier steps, then STEP; diagnostic only)',
  '  REPLAY is a replay folder (index.mjs) or entry module; STEP is a step id or 1-based number.',
  '  trial REPLAY --runs 1 --allow-fallback [other trial options] (diagnostic only)',
  '  report AGENT_DUMP [--out NEW_REPORT_HTML] (render saved agent.json without replaying)',
  '  --version  Print the Midscene SDK package version.',
  'All commands accept --env-file FILE. Trial reports execution; the coding Agent reviews evidence.',
].join('\n');
async function main() {
  const {
    values,
    positionals: [cmd, input, ...rest],
  } = parseArgs({
    allowPositionals: true,
    options: {
      ...Object.fromEntries(
        [
          'url',
          'out',
          'goal',
          'session',
          'cdp',
          'browser',
          'port',
          'source',
          'runs',
          'env-file',
          'step',
          'from',
          'until',
        ].map((key) => [key, { type: 'string' }]),
      ),
      headed: { type: 'boolean' },
      'reuse-tab': { type: 'boolean' },
      'allow-fallback': { type: 'boolean' },
      version: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.version)
    return JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ).version;
  if (values.help || !cmd) return help;
  if (rest.length || !input) throw new Error(help);
  const { cdp, browser } = values;
  if (values['reuse-tab'] && (cmd !== 'trial' || cdp === undefined))
    throw new Error('--reuse-tab requires trial --cdp');
  if (values.port !== undefined && cmd !== 'browser')
    throw new Error('--port is supported by browser');
  if (browser !== undefined) {
    if (cmd !== 'record' || input !== 'web')
      throw new Error('--browser is supported by record web');
    if (!['chrome', 'msedge', 'chromium'].includes(browser))
      throw new Error('--browser expects chrome, msedge or chromium');
    if (cdp !== undefined) throw new Error('Choose either --browser or --cdp');
  }
  if (cdp !== undefined) {
    if (!['record', 'run', 'trial'].includes(cmd))
      throw new Error('--cdp is supported by record web, run and trial');
    if (values.session !== undefined)
      throw new Error('Choose either --cdp or --session');
    validateCdp(cdp);
  }
  const stepSelector = (key) =>
    values[key] === undefined
      ? undefined
      : /^\d+$/.test(values[key])
        ? Number(values[key])
        : values[key];
  const required = (key) => {
    if (!values[key]?.trim()) throw new Error(`Missing --${key}`);
    return values[key];
  };
  if (values['env-file']) loadEnvFile(values['env-file']);
  else if (existsSync('.env')) loadEnvFile('.env');
  if (cmd === 'browser') {
    const { openDedicatedBrowser } = await import('./dedicated-browser.mjs');
    return openDedicatedBrowser(input, { port: values.port, url: values.url });
  }
  if (cmd === 'report') {
    const { readFile } = await import('node:fs/promises');
    const { renderAgentReport } = await import('./native-report.mjs');
    const dump = resolve(input);
    const report = values.out
      ? resolve(values.out)
      : join(dirname(dump), 'report.html');
    return {
      report: await renderAgentReport(await readFile(dump, 'utf8'), report),
    };
  }
  if (
    ['record', 'prepare', 'trial', 'run'].includes(cmd) &&
    !existsSync(new URL('../dist/es/tooling.mjs', import.meta.url))
  )
    throw new Error(
      'REPLAY_BUILD_REQUIRED: run pnpm exec nx build @midscene/replay',
    );
  if (cmd === 'record' && input === 'web') {
    const { record } = await import('./record.mjs');
    return record(required('url'), resolve(required('out')), { cdp, browser });
  }
  if (cmd === 'prepare') {
    if (values.goal !== undefined && !values.goal.trim())
      throw new Error('--goal must not be empty; omit it to infer intent');
    const recording = resolve(input);
    const out = resolve(required('out'));
    const { brief } = await import('./record.mjs');
    const { freezeSource, outsideRecording } = await import('./evidence.mjs');
    outsideRecording(recording, out);
    mkdirSync(dirname(out), { recursive: true });
    mkdirSync(out);
    freezeSource(recording, join(out, 'source.json'));
    const summary = brief(recording, out);
    const { prepareDependencies } = await import('./prepare.mjs');
    prepareDependencies(out);
    const skill = fileURLToPath(
      new URL('../skills/midscene-replay/SKILL.md', import.meta.url),
    );
    const templates = join(dirname(skill), 'templates');
    copyFileSync(join(templates, 'acceptance.md'), join(out, 'acceptance.md'));
    // Diagnostics and temporary files live here, outside the delivery.
    mkdirSync(join(out, 'scratch'));
    return [
      `Use the Midscene Replay skill at ${skill} in this coding Agent session.`,
      `Work in ${out}; read ${summary}, source.json and the original evidence at ${recording}.`,
      `Invoke node ${JSON.stringify(fileURLToPath(import.meta.url))}.`,
      values.goal
        ? `User intent: ${values.goal}`
        : 'Infer a specific business goal for developer review.',
    ].join('\n');
  }
  if (cmd === 'run') {
    const result = await (await import('./run.mjs')).run(resolve(input), {
      session: values.session && resolve(values.session),
      cdp,
      headless: values.headed ? false : undefined,
      out: values.out && resolve(values.out),
      from: stepSelector('from'),
      until: stepSelector('until'),
    });
    if (result.execution !== 'passed') process.exitCode = 1;
    return result;
  }
  if (cmd === 'trial')
    return (await import('./trial.mjs')).trial(resolve(input), {
      session: values.session && resolve(values.session),
      cdp,
      source: values.source && resolve(values.source),
      reuseTab: values['reuse-tab'],
      out: values.out && resolve(values.out),
      headless: values.headed ? false : undefined,
      allowFallback: values['allow-fallback'],
      step: stepSelector('step'),
      runs: values.runs === undefined ? undefined : Number(values.runs),
    });
  throw new Error(help);
}
try {
  const result = await main();
  console.log(
    typeof result === 'string' ? result : JSON.stringify(result, null, 2),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
