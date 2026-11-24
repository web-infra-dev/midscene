import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from '@rstest/core';
import { chromium } from 'playwright';

const cli = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));
const prepareUrl = new URL('../scripts/prepare.mjs', import.meta.url).href;
const command = (cwd: string, args: string[]) => {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: undefined },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const done = new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
  return { child, done, read: () => stdout };
};
const waitOutput = async (run: ReturnType<typeof command>, text: string) => {
  for (let i = 0; i < 400; i++) {
    if (run.read().includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Did not see ${text}: ${run.read()}`);
};

it('records login state and verifies native YAML three times; preparation retains the exact popup and cleanup waits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'replay-native-'));
  const project = join(root, 'project');
  mkdirSync(project);
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      req.url === '/popup'
        ? '<h1>Details</h1><button id="confirm" onclick="document.querySelector(\'output\').textContent=\'Confirmed\'">Confirm</button><output></output>'
        : `<body data-signed-in="${req.headers.cookie?.includes('auth=fixture') ?? false}"><a id="open" href="/popup" target="_blank">Open</a></body>`,
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const profile = join(root, 'profile');
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    args: ['--remote-debugging-port=0'],
  });
  const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(
    '\n',
  )[0];
  const cdp = `http://127.0.0.1:${port}`;
  const [page] = context.pages();
  const children: ReturnType<typeof command>[] = [];
  try {
    await context.addCookies([
      { name: 'auth', value: 'fixture', url, httpOnly: true },
    ]);
    await page.goto(url);
    const init = spawn(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import {prepareDependencies} from ${JSON.stringify(prepareUrl)};prepareDependencies(process.argv[1]);`,
        project,
      ],
      { cwd: dirname(cli) },
    );
    expect((await once(init, 'exit'))[0]).toBe(0);
    const recorded = join(root, 'recording');
    const record = command(project, [
      'record',
      'web',
      '--url',
      url,
      '--out',
      recorded,
      '--cdp',
      cdp,
    ]);
    children.push(record);
    await waitOutput(record, 'Recording.');
    await page.click('#open');
    record.child.stdin.end('\n');
    const recordedResult = await record.done;
    expect(recordedResult.code, recordedResult.stderr).toBe(0);
    expect(existsSync(join(recorded, 'trace.json'))).toBe(true);
    const sourceHash = readFileSync(join(recorded, 'events.jsonl'), 'utf8');
    mkdirSync(join(project, 'steps'));
    writeFileSync(
      join(project, 'midscene.config.mjs'),
      `
      import { appendFileSync } from 'node:fs';
      import { createMidsceneNodes } from '@midscene/test/midscene';
      import { PlaywrightBrowserAgent } from '@midscene/web/playwright/agent';
      import { webFileSetup } from '@midscene/replay/web-setup';
      const base=webFileSetup({url:${JSON.stringify(url)},cdp:${JSON.stringify(cdp)},mode:'cdp-state',headless:true,agentOptions:{modelConfig:{}}});
      export default {test:{replay:'strict'},fileSetup:{...base,async setup(ctx){ctx.onTeardown(()=>appendFileSync(${JSON.stringify(join(root, 'cleanup.log'))},'closed\\n'));return base.setup(ctx)}},nodes:createMidsceneNodes({agentClass:PlaywrightBrowserAgent,getAgent:({context})=>context.agent})};
    `,
    );
    writeFileSync(
      join(project, 'case.yaml'),
      'cases:\n  - name: login popup\n    steps:\n      - aiAct:\n          prompt: Open signed-in details\n          replay: ./steps/open.mjs\n      - aiAct:\n          prompt: Confirm details\n          replay: ./steps/confirm.mjs\n      - aiAssert:\n          prompt: Confirmed\n          replay: ./steps/check.mjs\n',
    );
    writeFileSync(
      join(project, 'steps/open.mjs'),
      `import {defineStep} from '@midscene/replay'; export default defineStep({ready:rp=>rp.expect({xpath:'//body'},{attributes:{'data-signed-in':'true'}}),run:rp=>rp.tap('Open',{candidates:[{xpath:'//*[@id="open"]'}],opensPage:{url:${JSON.stringify(`${url}popup`)}}}),done:rp=>rp.expect({xpath:'//h1'},{text:'Details'})});`,
    );
    writeFileSync(
      join(project, 'steps/confirm.mjs'),
      `import {defineStep} from '@midscene/replay';export default defineStep({run:rp=>rp.tap('Confirm',{candidates:[{xpath:'//*[@id="confirm"]'}]}),done:rp=>rp.expect({xpath:'//output'},{text:'Confirmed'})});`,
    );
    writeFileSync(
      join(project, 'steps/check.mjs'),
      `export default {async run(rp){await rp.expect({xpath:'//output'},{text:'Confirmed'});return {pass:true,thought:'program verified'}}};`,
    );
    const out = join(root, 'verification');
    const verify = command(project, [
      'verify',
      'case.yaml',
      '--case',
      'login popup',
      '--runs',
      '3',
      '--out',
      out,
    ]);
    children.push(verify);
    const verified = await verify.done;
    expect(
      verified.code,
      verified.stdout +
        verified.stderr +
        (existsSync(join(out, 'run-1/console.log'))
          ? readFileSync(join(out, 'run-1/console.log'), 'utf8')
          : ''),
    ).toBe(0);
    const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
    expect(result).toMatchObject({
      execution: 'passed',
      completedRuns: 3,
      review: 'pending',
    });
    for (const index of [1, 2, 3]) {
      const report = JSON.parse(
        readFileSync(join(out, `run-${index}/replay.json`), 'utf8'),
      );
      expect(report.result.summary).toMatchObject({ passed: 1, failed: 0 });
      expect(report.modelRequests).toEqual([]);
      expect(
        report.evidence.filter((e: { phase: string }) => e.phase === 'steps')
          .length,
      ).toBe(3);
      expect(existsSync(report.result.reportPath)).toBe(true);
      expect(existsSync(join(out, `run-${index}/review.png`))).toBe(true);
    }
    expect(readFileSync(join(recorded, 'events.jsonl'), 'utf8')).toBe(
      sourceHash,
    );
    const cleanupBefore = readFileSync(join(root, 'cleanup.log'), 'utf8');
    const pause = command(project, [
      'prepare-step',
      'case.yaml',
      '--case',
      'login popup',
      '--step',
      '2',
      '--record',
      '--out',
      join(root, 'step-recording'),
    ]);
    children.push(pause);
    await waitOutput(pause, '"status": "ready"');
    expect(readFileSync(join(root, 'cleanup.log'), 'utf8')).toBe(cleanupBefore);
    expect(pause.read()).toContain(`${url}popup`);
    pause.child.stdin.end('\n');
    const paused = await pause.done;
    expect(paused.code, paused.stdout + paused.stderr).toBe(0);
    expect(readFileSync(join(root, 'cleanup.log'), 'utf8')).toBe(
      `${cleanupBefore}closed\n`,
    );
    expect(existsSync(join(root, 'step-recording/preparation.json'))).toBe(
      true,
    );
    // A failed prefix never hands an unrelated/error page to the recorder.
    const openFile = join(project, 'steps/open.mjs');
    const originalOpen = readFileSync(openFile, 'utf8');
    writeFileSync(
      openFile,
      "export default {run(){throw new Error('prefix fixture failed')}}",
    );
    const failedPrefix = command(project, [
      'prepare-step',
      'case.yaml',
      '--case',
      'login popup',
      '--step',
      '2',
    ]);
    children.push(failedPrefix);
    const rejected = await failedPrefix.done;
    expect(rejected.code).toBe(1);
    expect(rejected.stdout).not.toContain('"status": "ready"');
    expect(rejected.stderr).toContain('PREPARE_PREFIX_FAILED');
    writeFileSync(openFile, originalOpen);

    // Reusing an existing tab preserves in-memory state and disconnects without closing it.
    await page.goto(url);
    await page.evaluate(() => {
      (window as Window & { reuseMarker?: string }).reuseMarker = 'retained';
    });
    const { webFileSetup } = await import('../scripts/web-setup.mjs');
    const cleanup: Array<() => Promise<void>> = [];
    const shared = await webFileSetup({
      url,
      cdp,
      mode: 'cdp-tab',
      agentOptions: { modelConfig: {} },
    }).setup({
      signal: new AbortController().signal,
      onTeardown: (fn) => cleanup.push(fn),
    });
    expect(await shared.agent.evaluateJavaScript('window.reuseMarker')).toBe(
      'retained',
    );
    expect(shared.replaySession).toMatchObject({
      mode: 'cdp-tab',
      browserContext: 'shared',
      tab: 'reused',
    });
    for (const dispose of cleanup) await dispose();
    expect(page.isClosed()).toBe(false);
    expect(
      await page.evaluate(
        () => (window as Window & { reuseMarker?: string }).reuseMarker,
      ),
    ).toBe('retained');

    // The regular TypeScript config loader shares the same frozen execution path.
    const configFile = join(project, 'midscene.config.ts');
    renameSync(join(project, 'midscene.config.mjs'), configFile);
    writeFileSync(
      configFile,
      readFileSync(configFile, 'utf8').replace(
        'const base=',
        'const base: ReturnType<typeof webFileSetup> =',
      ),
    );
    const diagnosticOut = join(root, 'typescript-config');
    const diagnostic = command(project, [
      'verify',
      'case.yaml',
      '--case',
      'login popup',
      '--runs',
      '1',
      '--out',
      diagnosticOut,
    ]);
    children.push(diagnostic);
    const diagnosed = await diagnostic.done;
    expect(diagnosed.code, diagnosed.stdout + diagnosed.stderr).toBe(0);
    expect(
      JSON.parse(readFileSync(join(diagnosticOut, 'result.json'), 'utf8')),
    ).toMatchObject({
      execution: 'passed',
      mode: 'diagnostic',
      completedRuns: 1,
    });

    // Changing any authored helper during execution invalidates the entire group.
    writeFileSync(
      openFile,
      `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(project, 'changed.txt'))},'edited');\n${originalOpen}`,
    );
    const invalidOut = join(root, 'changed-inputs');
    const changed = command(project, [
      'verify',
      'case.yaml',
      '--case',
      'login popup',
      '--runs',
      '3',
      '--out',
      invalidOut,
    ]);
    children.push(changed);
    const invalid = await changed.done;
    expect(invalid.code).toBe(1);
    const invalidResult = JSON.parse(
      readFileSync(join(invalidOut, 'result.json'), 'utf8'),
    );
    expect(invalidResult).toMatchObject({
      execution: 'failed',
      completedRuns: 0,
    });
    expect(invalidResult.errors[0].message).toContain('VERIFY_INPUTS_CHANGED');
    expect(existsSync(join(invalidOut, 'run-1/replay.json'))).toBe(true);
  } finally {
    for (const child of children)
      if (child.child.exitCode === null) child.child.kill('SIGINT');
    await context.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}, 120_000);
