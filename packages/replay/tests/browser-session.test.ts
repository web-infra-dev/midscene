import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReportActionDump } from '@midscene/core/report';
import { expect, it } from '@rstest/core';
import { type BrowserContext, chromium } from 'playwright';

const cli = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));
it('records and prepares a signed-in flow, then verifies strict three-round trial and failure evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-cdp-'));
  const profile = join(root, 'profile');
  const server = createServer((req, res) => {
    const signedIn = req.headers.cookie?.includes('testCookie=fixture-secret');
    const content =
      req.url === '/'
        ? '<button id="save" onclick="sessionStorage.setItem(\'saved\', \'yes\'); localStorage.setItem(\'signedIn\', \'changed-by-replay\')">Save</button><a href="/popup" target="_blank">Popup</a>'
        : `<button id="confirm" onclick="document.querySelector('output').textContent='Confirmed'">${req.url === '/popup' ? 'Popup action' : 'Unrelated action'}</button><output></output>`;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<body data-signed-in="${Boolean(signedIn)}">${content}</body>`);
  });
  let context: BrowserContext | undefined;
  let recordingProcess: ReturnType<typeof spawn> | undefined;
  let recordingDone: Promise<unknown> | undefined;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      args: ['--remote-debugging-port=0'],
    });
    const [port] = readFileSync(
      join(profile, 'DevToolsActivePort'),
      'utf8',
    ).split('\n');
    const cdp = `http://127.0.0.1:${port}`;
    const [page] = context.pages();
    await context.addCookies([
      { name: 'testCookie', value: 'fixture-secret', url, httpOnly: true },
    ]);
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.setItem('signedIn', 'yes');
      sessionStorage.setItem('tabMarker', 'live');
    });
    const unrelated = await context.newPage();
    await unrelated.goto(`${url}unrelated`);

    const command = (operation: string, ...args: string[]) => {
      if (operation !== 'prepare') args.push('--cdp', cdp);
      const child = spawn(process.execPath, [cli, operation, ...args], {
        cwd: root,
        env: { ...process.env, MIDSCENE_RUN_DIR: join(root, 'artifacts') },
        stdio: 'pipe',
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (data) => {
        stdout += data;
      });
      child.stderr.setEncoding('utf8').on('data', (data) => {
        stderr += data;
      });
      // A child that outlives the test can keep the worker and CI job alive.
      const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
      const done = once(child, 'close')
        .then(([code, signal]) => ({
          code,
          stdout,
          stderr: signal ? `CLI terminated with ${signal}: ${stderr}` : stderr,
        }))
        .finally(() => clearTimeout(timeout));
      return { child, done };
    };

    const trace = join(root, 'recording');
    const { child, done } = command(
      'record',
      'web',
      '--url',
      url,
      '--out',
      trace,
    );
    recordingProcess = child;
    recordingDone = done;
    const prompt = new Promise<void>((resolve) => {
      let output = '';
      child.stdout.on('data', (data) => {
        output += data;
        if (output.includes('Press Enter to finish')) resolve();
      });
    });
    await Promise.race([
      prompt,
      done.then(({ stderr }) => {
        throw new Error(stderr);
      }),
    ]);
    await page.getByRole('button', { name: 'Save' }).click();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('link', { name: 'Popup' }).click(),
    ]);
    await popup.waitForFunction(() =>
      Object.keys(window).some((key) => key.startsWith('__midsceneRecorder_')),
    );
    await popup.getByRole('button').click();
    await unrelated.reload();
    await unrelated.getByRole('button').click();
    child.stdin.end('\n');
    const recorded = await done;
    expect(recorded.stderr).toBe('');
    expect(recorded.code).toBe(0);
    const events = readFileSync(join(trace, 'events.jsonl'), 'utf8');
    expect(events).toContain('Popup action');
    expect(events).toContain('Save');
    expect(events).not.toContain('Unrelated action');
    expect(events).not.toContain('fixture-secret');
    for (const tab of [page, popup, unrelated]) {
      expect(tab.isClosed()).toBe(false);
      expect(
        await tab.evaluate(() =>
          Object.keys(window).some((key) =>
            key.startsWith('__midsceneRecorder_'),
          ),
        ),
      ).toBe(false);
    }

    const authoring = join(root, 'authoring');
    const bundle = join(authoring, 'replay');
    const prepared = await command('prepare', trace, '--out', authoring).done;
    expect(prepared.code, prepared.stderr).toBe(0);
    expect(readFileSync(join(authoring, 'brief.md'), 'utf8')).toContain('Save');
    mkdirSync(join(bundle, 'steps'), { recursive: true });
    writeFileSync(
      join(bundle, 'index.mjs'),
      `import {defineReplay} from '@midscene/replay/experimental';
      import save from './steps/save.mjs';
      import confirm from './steps/confirm.mjs';
      export default defineReplay({
        meta:{platform:'web',startUrl:${JSON.stringify(url)},requires:{popups:true}},
        steps:[save,confirm],
      });`,
    );
    writeFileSync(
      join(bundle, 'steps/confirm.mjs'),
      `import assert from 'node:assert/strict';
      import {defineStep} from '@midscene/replay/experimental';
      export default defineStep({
        id:'confirm', title:'Confirm in popup', retry:'never',
        async run(rp) {
          await rp.tap('Open popup', {
            candidates:[{xpath:'//a[@href="/popup"]'}],
            opensPage:{url:${JSON.stringify(`${url}popup`)}},
          });
          await rp.tap('Confirm', {candidates:[{xpath:'//button[@id="confirm"]'}]});
        },
        async done(rp) {
          assert.equal(await rp.read(() => document.querySelector('output').textContent), 'Confirmed');
        },
      });`,
    );
    const writeSave = (marker: string | null, expected = 'yes') => {
      writeFileSync(
        join(bundle, 'steps/save.mjs'),
        `
        import assert from 'node:assert/strict';
        import {defineStep} from '@midscene/replay/experimental';
        export default defineStep({
          id:'save', title:'Save', retry:'never',
          async ready(rp) {
            assert.equal(await rp.read(() => document.body.dataset.signedIn), 'true');
            assert.equal(await rp.read(() => localStorage.getItem('signedIn')), 'yes');
            assert.equal(await rp.read(() => sessionStorage.getItem('tabMarker')), ${JSON.stringify(marker)});
          },
          async run(rp) {
            await rp.tap('Save', {candidates:[{xpath:'//button[@id="save"]'}]});
          },
          async done(rp) {
            assert.equal(await rp.read(() => sessionStorage.getItem('saved')), ${JSON.stringify(expected)});
          },
        });`,
      );
    };

    await page.evaluate(() => localStorage.setItem('signedIn', 'yes'));
    writeSave('live');
    const dailyDir = join(root, 'daily');
    const daily = await command('run', bundle, '--out', dailyDir).done;
    expect(daily.code, daily.stderr || daily.stdout).toBe(0);
    expect(
      JSON.parse(readFileSync(join(dailyDir, 'result.json'), 'utf8')),
    ).toMatchObject({
      execution: 'passed',
      host: { session: 'cdp-tab' },
    });
    expect(await page.evaluate(() => localStorage.getItem('signedIn'))).toBe(
      'changed-by-replay',
    );
    await page.evaluate(() => localStorage.setItem('signedIn', 'yes'));

    writeSave(null);
    const trialDir = join(root, 'trial');
    const trial = await command('trial', bundle, '--out', trialDir).done;
    expect(trial.code, trial.stderr).toBe(0);
    const trialResult = readFileSync(join(trialDir, 'result.json'), 'utf8');
    const accepted = JSON.parse(trialResult);
    expect(accepted).toMatchObject({
      execution: 'passed',
      mode: 'strict',
      completedRuns: 3,
      inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      snapshotScope: 'replay-directory',
      host: { session: 'cdp-state' },
    });
    expect(accepted.reports).toHaveLength(3);
    for (const report of accepted.reports) {
      expect(report).toMatchObject({
        execution: 'passed',
        fallbacks: [],
        requests: [],
        terminal: { url: `${url}popup` },
        flow: { steps: [{ status: 'passed' }, { status: 'passed' }] },
      });
      expect(
        readFileSync(join(trialDir, `run-${report.index}/review.png`)).length,
      ).toBeGreaterThan(0);
    }
    const stepIndex = readFileSync(join(trialDir, 'steps.md'), 'utf8');
    expect(stepIndex).toContain('Confirm in popup');
    expect(stepIndex).toContain('(../authoring/acceptance.md)');
    expect(stepIndex).toContain('(result.json)');
    expect(stepIndex).toContain('(replay/)');
    expect(stepIndex).toContain('(run-1/agent.json)');
    expect(stepIndex).toContain('(run-1/report.html)');
    expect(stepIndex).toContain(
      'browser context fresh · tab new · business state not-reset',
    );
    expect(stepIndex).toMatch(/\(run-1\/images\/[a-f0-9]{64}\.(png|jpg)\)/);
    const nativeReport = JSON.parse(
      readFileSync(join(trialDir, 'run-1/report.json'), 'utf8'),
    );
    expect(nativeReport.evidence.entries.length).toBeGreaterThan(0);
    const reportHtml = join(trialDir, 'run-1/report.html');
    const reportDump = await readReportActionDump(reportHtml);
    expect(
      reportDump.executions
        .flatMap(({ tasks }) => tasks)
        .some((task) =>
          task.recorder?.some((record) => record.type === 'screenshot'),
        ),
    ).toBe(true);
    const reexport = join(root, 'restored.html');
    const report = spawn(
      process.execPath,
      [cli, 'report', join(trialDir, 'run-1/agent.json'), '--out', reexport],
      { cwd: root, stdio: 'ignore' },
    );
    expect((await once(report, 'exit'))[0]).toBe(0);
    expect(await readReportActionDump(reexport)).toEqual(reportDump);
    for (const file of ['index.mjs', 'steps/save.mjs', 'steps/confirm.mjs'])
      expect(readFileSync(join(trialDir, 'replay', file))).toEqual(
        readFileSync(join(bundle, file)),
      );
    expect(await page.evaluate(() => localStorage.getItem('signedIn'))).toBe(
      'yes',
    );
    expect(trialResult).not.toContain('fixture-secret');

    writeSave(null, 'unexpected result');
    const failedDir = join(root, 'failed-trial');
    const rejected = await command('trial', bundle, '--out', failedDir).done;
    expect(rejected.code, rejected.stderr).toBe(1);
    const failure = JSON.parse(
      readFileSync(join(failedDir, 'result.json'), 'utf8'),
    );
    expect(failure).toMatchObject({
      execution: 'failed',
      requestedRuns: 3,
      completedRuns: 1,
      reports: [
        {
          execution: 'failed',
          flow: {
            failedStep: 'save',
            steps: [
              { status: 'failed', attempts: [{ phase: 'done' }] },
              { status: 'not-run' },
            ],
          },
        },
      ],
    });
    expect(failure.inputDigest).not.toBe(accepted.inputDigest);
    expect(
      readFileSync(join(failedDir, 'run-1/terminal.png')).length,
    ).toBeGreaterThan(0);
    expect(readFileSync(join(failedDir, 'steps.md'), 'utf8')).toContain(
      '[Failure image](run-1/terminal.png)',
    );
    expect(readFileSync(join(trace, 'events.jsonl'), 'utf8')).toBe(events);

    // Explicit reuse retains tab-only state across all rounds.
    await page.evaluate(() => {
      sessionStorage.setItem('rounds', '0');
      document.querySelector('#save')?.addEventListener('click', () => {
        sessionStorage.setItem(
          'rounds',
          String(Number(sessionStorage.getItem('rounds')) + 1),
        );
      });
    });
    writeFileSync(
      join(bundle, 'index.mjs'),
      `import {defineReplay,defineStep} from '@midscene/replay/experimental';
       export default defineReplay({
         meta: {platform:'web',startUrl:${JSON.stringify(url)},ready:{xpath:'//button[@id="save"]'}},
         steps:[defineStep({id:'save',title:'Save in the existing tab',
           async run(rp) {
             await rp.waitFor(() => sessionStorage.getItem('tabMarker') === 'live', {title:'Existing tab'});
             await rp.tap('Save', {candidates:[{xpath:'//button[@id="save"]'}]});
           }
         })],
       });`,
    );
    const sharedDir = join(root, 'reuse-tab');
    const shared = await command(
      'trial',
      bundle,
      '--out',
      sharedDir,
      '--reuse-tab',
    ).done;
    expect(shared.code, shared.stderr || shared.stdout).toBe(0);
    expect(
      JSON.parse(readFileSync(join(sharedDir, 'result.json'), 'utf8')),
    ).toMatchObject({
      completedRuns: 3,
      host: {
        session: 'cdp-tab',
        browserContext: 'shared',
        tab: 'reused',
        businessState: 'not-reset',
      },
    });
    expect(await page.evaluate(() => sessionStorage.getItem('rounds'))).toBe(
      '3',
    );
    expect(readFileSync(join(sharedDir, 'steps.md'), 'utf8')).toContain(
      'Wait Existing tab: passed',
    );

    const duplicate = await context.newPage();
    await duplicate.goto(url);
    const ambiguous = await command(
      'record',
      'web',
      '--url',
      url,
      '--out',
      join(root, 'ambiguous'),
    ).done;
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.stderr).toContain('CDP_TAB_AMBIGUOUS');
    expect(duplicate.isClosed()).toBe(false);
  } finally {
    recordingProcess?.kill();
    await recordingDone;
    await context?.close();
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
