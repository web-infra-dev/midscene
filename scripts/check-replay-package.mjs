import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Exercise installed tarballs outside the workspace; no source links or prepareDependencies.
const repo = fileURLToPath(new URL('../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'midscene-replay-package-'));
const project = join(root, 'project');
const tarballs = join(root, 'tarballs');
mkdirSync(project);
mkdirSync(tarballs);
const run = async (bin, args, cwd = project) => {
  try {
    return await promisify(execFile)(bin, args, {
      cwd,
      env: { ...process.env, MIDSCENE_REPORT_QUIET: 'true', NODE_PATH: '' },
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `${bin} ${args.join(' ')} failed:\n${error.stdout ?? ''}\n${error.stderr ?? ''}`,
      { cause: error },
    );
  }
};
const packages = new Map(
  readdirSync(join(repo, 'packages')).flatMap((dir) => {
    try {
      const path = join(repo, 'packages', dir);
      const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
      return [[pkg.name, { path, pkg }]];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }),
);
const dependencies = {};
// Match the browser driver installed by CI, so this check can reuse its browser cache.
const playwrightVersion = JSON.parse(
  readFileSync(
    join(
      packages.get('@midscene/replay').path,
      'node_modules/playwright/package.json',
    ),
    'utf8',
  ),
).version;
async function pack(name) {
  if (dependencies[name]) return;
  const { path, pkg } = packages.get(name);
  const dest = join(tarballs, name.replaceAll('/', '-'));
  mkdirSync(dest);
  await run('pnpm', ['pack', '--pack-destination', dest], path);
  const tgz = readdirSync(dest).find((file) => file.endsWith('.tgz'));
  assert(tgz, `Missing tarball for ${name}`);
  dependencies[name] = `file:${join(dest, tgz)}`;
  for (const [dep, version] of Object.entries({
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
  }))
    if (version.startsWith('workspace:')) await pack(dep);
}

let server;
try {
  for (const name of ['@midscene/replay', '@midscene/test']) await pack(name);
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          ...dependencies,
          playwright: playwrightVersion,
        },
        pnpm: { overrides: { ...dependencies, playwright: playwrightVersion } },
      },
      null,
      2,
    ),
  );
  // Match the repository's public registry, not a developer's global mirror.
  writeFileSync(
    join(project, '.npmrc'),
    'registry=https://registry.npmjs.org/\n',
  );
  await run('pnpm', [
    'install',
    '--ignore-scripts',
    `--config.cache-dir=${join(root, 'metadata-cache')}`,
  ]);
  console.log(
    `Installed ${Object.keys(dependencies).length} workspace tarballs in a clean external project (${process.version}).`,
  );

  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<button id="apply" onclick="document.querySelector(\'output\').textContent=\'Applied\'">Apply</button><output>Pending</output>',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/`;
  writeFileSync(
    join(project, 'midscene.config.ts'),
    `
import { webFileSetup } from '@midscene/replay/web-setup';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightBrowserAgent } from '@midscene/web/playwright/agent';
const url: string = ${JSON.stringify(url)};
export default {
  fileSetup: webFileSetup({url,headless:true,launch:{args:['--no-sandbox']},agentOptions:{modelConfig:{}}}),
  nodes: createMidsceneNodes({agentClass:PlaywrightBrowserAgent,getAgent:({context})=>context.agent}),
  test: {replay:'strict',retry:0},
};
`,
  );
  writeFileSync(
    join(project, 'case.yaml'),
    `cases:
  - name: package smoke
    steps:
      - aiAct:
          prompt: Apply once
          replay: ./apply.mjs
      - aiAssert:
          prompt: Applied
          replay: ./check.mjs
`,
  );
  writeFileSync(
    join(project, 'apply.mjs'),
    `import {defineStep} from '@midscene/replay';
export default defineStep({run:rp=>rp.tap('Apply',{candidates:[{xpath:'//*[@id="apply"]'}]}),done:rp=>rp.expect({xpath:'//output'},{text:'Applied'})});`,
  );
  writeFileSync(
    join(project, 'check.mjs'),
    `export default {async run(rp){await rp.expect({xpath:'//output'},{text:'Applied'});return {pass:true}}};`,
  );
  await run('pnpm', ['exec', 'midscene-test', 'case.yaml', '--replay=strict']);
  console.log(
    'Installed midscene-test: deterministic browser action and assertion passed.',
  );

  // Exercise the interactive CLI, release only after its real handoff prompt.
  const child = spawn(
    'pnpm',
    [
      'exec',
      'midscene-replay',
      'prepare-step',
      'case.yaml',
      '--case',
      'package smoke',
      '--step',
      '2',
    ],
    { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let output = '';
  let released = false;
  const timeout = setTimeout(() => child.kill('SIGINT'), 60_000);
  child.stdout.on('data', (bytes) => {
    output += bytes;
    if (!released && output.includes('操作完成后按 Enter')) {
      released = true;
      child.stdin.end('\n');
    }
  });
  child.stderr.on('data', (bytes) => {
    output += bytes;
  });
  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, output);
    assert(released && output.includes('prepared-and-released'), output);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGINT');
  }
  console.log(
    'Installed prepare-step: held step 2 after its prefix, then released resources.',
  );

  const out = join(root, 'verification');
  await run('pnpm', [
    'exec',
    'midscene-replay',
    'verify',
    'case.yaml',
    '--case',
    'package smoke',
    '--runs',
    '3',
    '--out',
    out,
  ]);
  const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
  assert.equal(result.execution, 'passed');
  assert.equal(result.completedRuns, 3);
  for (const index of [1, 2, 3]) {
    const report = JSON.parse(
      readFileSync(join(out, `run-${index}/replay.json`), 'utf8'),
    );
    assert.equal(report.result.summary.passed, 1);
    assert.deepEqual(report.modelRequests, []);
    assert(readFileSync(report.result.reportPath, 'utf8').includes('<html'));
  }
  console.log(
    'Installed verify: 3/3 strict runs passed, zero model calls, native HTML reports generated.',
  );
  rmSync(root, { recursive: true, force: true });
} catch (error) {
  console.error(`Package smoke artifacts retained at ${root}`);
  throw error;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
