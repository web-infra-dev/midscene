/* Run from the repository root: pnpm exec node scripts/experiments/planning-guidance-benchmark.cjs */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const webRequire = createRequire(
  path.resolve('packages/web-integration/package.json'),
);
if (process.env.WAIT_AB_ENV) {
  const config = webRequire('dotenv').parse(
    fs.readFileSync(process.env.WAIT_AB_ENV),
  );
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('MIDSCENE_') && /MODEL|CACHE/.test(key))
      delete process.env[key];
  }
  Object.assign(process.env, config);
}
process.env.MIDSCENE_MODEL_RETRY_COUNT = '0';
const { chromium } = webRequire('playwright');
// Select only the system-prompt builder; all other code is identical between arms.
const { Module } = require('node:module');
const { createHash } = require('node:crypto');
const promptPath = path.resolve(
  'packages/core/dist/lib/ai-model/prompt/planning/system-prompt.js',
);
const baselinePath = process.env.WAIT_BASELINE_PROMPT;
if (!baselinePath)
  throw new Error('WAIT_BASELINE_PROMPT must name the baseline build artifact');
const baselineBytes = fs.readFileSync(baselinePath, 'utf8');
const baselineModule = new Module(promptPath, module);
baselineModule.filename = promptPath;
baselineModule.paths = Module._nodeModulePaths(path.dirname(promptPath));
baselineModule._compile(baselineBytes, promptPath);
const candidate = require(promptPath).buildStandardPlanningSystemPrompt;
const baseline = baselineModule.exports.buildStandardPlanningSystemPrompt;
let activeArm = 'baseline';
let promptHashes = [];
require.cache[promptPath].exports = {
  buildStandardPlanningSystemPrompt: async (...args) => {
    const result = await (activeArm === 'candidate' ? candidate : baseline)(
      ...args,
    );
    promptHashes.push(createHash('sha256').update(result).digest('hex'));
    return result;
  },
};
const { PlaywrightAgent } = webRequire('./dist/lib/playwright/index.js');

const root = path.resolve(
  process.env.WAIT_AB_OUTPUT ||
    `${process.env.MIDSCENE_RUN_DIR || 'midscene_run'}/test-results/wait-ab-${Date.now()}`,
);
const rounds = Number(process.env.WAIT_AB_ROUNDS || 3);
const cases = [
  'ready',
  'validation',
  'menu',
  'export',
  'permission',
  'click-only',
];
const prompts = {
  'click-only': 'Click the Open editor button. Do not submit anything.',
  ready: 'Enter hello and send the message.',
  validation: 'Enter hello and send the message.',
  menu: 'Open the menu and choose Settings.',
  export: 'Export the data and download the resulting file.',
  permission: 'Enter hello and send the message.',
};
function fixture(scene) {
  return `<!doctype html><html><head><style>body{font:24px Arial;margin:80px;background:#fafafa;color:#222}button,input{font:24px Arial;padding:18px;margin:12px}button:disabled{background:#ddd;color:#888}#status{margin:24px}h1{font-size:32px}</style></head><body><h1>Workspace</h1><div id="app"></div><div id="status"></div><script>
  const scene=${JSON.stringify(scene)};
  window.metrics={inputs:0,sendAttempts:0,sends:0,opens:0,exports:0,downloads:0,settings:0,disabledClicks:0,events:[]};
  const m=window.metrics, app=document.querySelector('#app'), status=document.querySelector('#status');
  function event(type){m.events.push({type,at:performance.now()})}
  document.addEventListener('pointerdown',e=>{if(e.target.disabled){m.disabledClicks++;event('disabled-click')}},true);
  if(['ready','validation','permission'].includes(scene)) {
    app.innerHTML='<input placeholder="Message" aria-label="Message"><button id="send">Send</button>';
    const input=app.querySelector('input'), send=app.querySelector('button');
    if(scene==='permission'){send.disabled=true;status.textContent='Error: This account is read-only. Sending messages is not permitted.'}
    let timer;
    input.addEventListener('input',()=>{m.inputs++;event('input');if(scene==='validation'){send.disabled=true;status.textContent='Validating message… Please wait.';clearTimeout(timer);timer=setTimeout(()=>{send.disabled=false;status.textContent='Message validated. Send is ready.';event('ready')},12000)}});
    send.onclick=()=>{m.sendAttempts++;event('send');if(input.value==='hello'){m.sends++;status.textContent='Message sent successfully: hello';send.disabled=true}};
  } else if(scene==='menu') {
    app.innerHTML='<button id="open">Open menu</button><div id="menu"></div>';
    document.querySelector('#open').onclick=()=>{m.opens++;event('open');status.textContent='Loading menu…';setTimeout(()=>{status.textContent='Menu ready. Choose an option.';event('ready');document.querySelector('#menu').innerHTML='<button id="settings">Settings</button>';document.querySelector('#settings').onclick=()=>{m.settings++;event('settings');status.textContent='Settings opened successfully'}},12000)};
  } else if(scene==='click-only') {
    app.innerHTML='<button id="open">Open editor</button><div id="editor"></div>';
    document.querySelector('#open').onclick=()=>{m.opens++;document.querySelector('#editor').innerHTML='<button id="submit">Submit</button>';document.querySelector('#submit').onclick=()=>{m.sends++};status.textContent='Editor opened. Unsaved draft.'};
  } else {
    app.innerHTML='<button id="export">Export data</button><div id="result"></div>';
    document.querySelector('#export').onclick=()=>{m.exports++;event('export');status.textContent='Preparing export…';setTimeout(()=>{status.textContent='Export ready. Download the file.';event('ready');document.querySelector('#result').innerHTML='<button id="download">Download file</button>';document.querySelector('#download').onclick=()=>{m.downloads++;event('download');status.textContent='File downloaded successfully'}},12000)};
  }
  </script></body></html>`;
}
async function main() {
  fs.mkdirSync(root, { recursive: true });
  const manifest = {
    head: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    baselineArtifactSha256: createHash('sha256')
      .update(baselineBytes)
      .digest('hex'),
    candidateArtifactSha256: createHash('sha256')
      .update(fs.readFileSync(promptPath))
      .digest('hex'),
    patch: execFileSync(
      'git',
      [
        'diff',
        '--',
        'packages/core/src/ai-model/prompt/planning/system-prompt.ts',
      ],
      { encoding: 'utf8' },
    ),
    model: process.env.MIDSCENE_MODEL_NAME,
    family: process.env.MIDSCENE_MODEL_FAMILY,
    rounds,
    cases,
    prompts,
    delayMs: 12000,
    cache: false,
    retries: 0,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const results = [];
  try {
    for (let round = 1; round <= rounds; round++)
      for (const scene of cases)
        for (const arm of (round + cases.indexOf(scene)) % 2
          ? ['baseline', 'candidate']
          : ['candidate', 'baseline']) {
          activeArm = arm;
          promptHashes = [];
          const name = `${scene}-${arm}-${round}`;
          const dir = path.join(root, name);
          fs.mkdirSync(dir, { recursive: true });
          const context = await browser.newContext({
            viewport: { width: 1100, height: 800 },
          });
          const page = await context.newPage();
          await page.setContent(fixture(scene));
          await page.screenshot({ path: path.join(dir, 'before.png') });
          const agent = new PlaywrightAgent(page, {
            cache: false,
            generateReport: false,
            autoPrintReportMsg: false,
            reportFileName: `ab-${name}`,
            replanningCycleLimit: 8,
          });
          const waits = [];
          const start = Date.now();
          let error;
          let output;
          try {
            output = await agent.aiAct(prompts[scene], {
              abortSignal: AbortSignal.timeout(120000),
            });
          } catch (e) {
            error = e.message;
          }
          const elapsedMs = Date.now() - start;
          const metrics = await page.evaluate(() => window.metrics);
          const businessSuccess =
            scene === 'click-only'
              ? !error && metrics.opens === 1 && metrics.sends === 0
              : scene === 'permission'
                ? Boolean(
                    error &&
                      /read.only|permission|not permitted|只读|权限/i.test(
                        error,
                      ),
                  ) && metrics.sends === 0
                : scene === 'menu'
                  ? metrics.settings === 1
                  : scene === 'export'
                    ? metrics.downloads === 1
                    : metrics.sends === 1;
          const dump = JSON.parse(agent.dumpDataString());
          fs.writeFileSync(
            path.join(dir, 'dump.json'),
            JSON.stringify(dump, null, 2),
          );
          await page.screenshot({ path: path.join(dir, 'after.png') });
          const tasks = (dump.executions || []).flatMap((e) => e.tasks || []);
          const usages = tasks
            .filter((t) => t.usage)
            .map((t) => ({ type: t.type, subType: t.subType, ...t.usage }));
          const inputActions = tasks.filter(
            (t) => t.type === 'Action Space' && t.subType === 'Input',
          ).length;
          const clean =
            businessSuccess &&
            metrics.disabledClicks === 0 &&
            inputActions <= 1 &&
            metrics.sendAttempts <= 1 &&
            metrics.opens <= 1 &&
            metrics.exports <= 1 &&
            (!['ready', 'permission'].includes(scene) || waits.length === 0);
          const result = {
            name,
            round,
            scene,
            arm,
            output,
            promptHashes,
            elapsedMs,
            error,
            businessSuccess,
            clean,
            metrics,
            inputActions,
            waits,
            modelCalls: usages.length,
            usages,
          };
          results.push(result);
          fs.writeFileSync(
            path.join(root, 'results.json'),
            JSON.stringify(results, null, 2),
          );
          console.log(
            JSON.stringify({
              name,
              businessSuccess,
              clean,
              elapsedMs: result.elapsedMs,
              waits: waits.length,
              modelCalls: usages.length,
              error,
            }),
          );
          await agent.destroy();
          if (
            error &&
            /401|invalid.token|APIConnectionError|model request failed/i.test(
              error,
            )
          ) {
            throw new Error(
              `Infrastructure failure in ${name}; stop experiment and exclude this batch.`,
            );
          }
          await context.close();
        }
  } finally {
    await browser.close();
  }
  console.log(`Artifacts: ${root}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
