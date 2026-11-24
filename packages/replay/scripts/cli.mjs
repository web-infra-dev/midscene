#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateCdp } from './browser.mjs';

const help = [
  'Midscene Replay: optional script implementations of native ai* nodes.',
  '  record web --url URL --out RECORDING [--browser chrome|msedge|chromium | --cdp ENDPOINT]',
  '  browser chrome|msedge [--port PORT] [--url URL] (persistent signed-in profile, macOS)',
  '  prepare RECORDING --out WORKSPACE [--goal TEXT]',
  '  prepare-step CASE.yaml --case NAME --step N [--config CONFIG] [--record --out RECORDING]',
  '  verify CASE.yaml [--case NAME] [--config CONFIG] [--runs 3] [--out NEW_DIR]',
  'Daily execution: midscene-test CASE.yaml --replay=auto|strict|off',
  'Browser/login/reset settings belong to the native Test project. No standalone replay run/trial/report.',
  'All commands accept --env-file FILE. The coding Agent reviews evidence independently.',
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
          'cdp',
          'browser',
          'port',
          'runs',
          'env-file',
          'step',
          'case',
          'config',
        ].map((key) => [key, { type: 'string' }]),
      ),
      record: { type: 'boolean' },
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
    if (cmd !== 'record')
      throw new Error(
        '--cdp is a recording option. Configure native Test fileSetup for execution.',
      );
    validateCdp(cdp);
  }
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
  if (cmd === 'prepare-step')
    return (await import('./prepare-step.mjs')).prepareStep(input, {
      caseName: values.case,
      step: Number(values.step),
      record: values.record,
      out: values.out,
      configPath: values.config,
    });
  if (cmd === 'verify')
    return (await import('./verify.mjs')).verify(input, {
      caseName: values.case,
      runs: values.runs === undefined ? 3 : Number(values.runs),
      out: values.out,
      configPath: values.config,
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
