/**
 * AX (accessibility) tree capture benchmark for iOS.
 *
 * Measures the cost of fetching and pruning the WDA `/source?format=json`
 * tree, the cache-hit speedup, and how both compare against the
 * screenshot every agent loop currently pays. Runs against a booted
 * simulator with WebDriverAgent already running.
 *
 * Usage:
 *   pnpm --filter @midscene/ios benchmark:ax-tree [-- --json results.json]
 *
 * Env:
 *   WDA_PORT   WebDriverAgent port (default 8100)
 *   WDA_HOST   WebDriverAgent host (default localhost)
 *   BENCH_APP  Bundle id to benchmark against (default com.apple.Preferences)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { IOSDevice } from '../src/device';
import type {
  IOSWebDriverClient,
  WdaSourceNode,
} from '../src/ios-webdriver-client';
import {
  countUiNodes,
  countWdaSourceNodes,
  wdaSourceToUiNode,
} from '../src/ui-tree-capture';

const wdaPort = Number(process.env.WDA_PORT ?? 8100);
const wdaHost = process.env.WDA_HOST ?? 'localhost';
const benchApp = process.env.BENCH_APP ?? 'com.apple.Preferences';
const jsonOut = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1]
  : undefined;

const COLD_ITERATIONS = 5;
const CACHE_HIT_ITERATIONS = 9;
const SCREENSHOT_ITERATIONS = 5;
const INVALIDATION_ROUNDS = 3;

interface TimedRun {
  label: string;
  samples: number[];
  note?: string;
}

function stats(samples: number[]) {
  if (samples.length === 0) {
    return { mean: 0, min: 0, p50: 0, p95: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, n) => acc + n, 0);
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    mean: Math.round(sum / samples.length),
    min: Math.round(sorted[0]),
    p50: Math.round(percentile(50)),
    p95: Math.round(percentile(95)),
  };
}

function fmt(row: (string | number)[]) {
  return `| ${row.join(' | ')} |`;
}

function fail(message: string): never {
  console.error(`pre-flight failed: ${message}`);
  console.error(
    `Start WebDriverAgent on a booted simulator first, e.g. via packages/ios/scripts/run-simulator-ci-smokes.sh or:
  xcrun simctl boot <udid>
  USE_PORT=${wdaPort} xcodebuild -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner \\
    -destination 'platform=iOS Simulator,id=<udid>' -derivedDataPath /tmp/wda-derived \\
    CODE_SIGNING_ALLOWED=NO test`,
  );
  process.exit(1);
}

function preflight() {
  if (process.platform !== 'darwin') {
    fail('this benchmark requires macOS');
  }
  let booted = '';
  try {
    booted = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], {
      encoding: 'utf8',
    });
  } catch {
    fail('could not query simulator state (xcrun simctl)');
  }
  if (!/iOS\s+\d/.test(booted)) {
    fail('no booted iOS simulator found');
  }
  try {
    const status = execFileSync(
      'curl',
      ['--max-time', '5', '-fsS', `http://${wdaHost}:${wdaPort}/status`],
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(status);
    if (!parsed?.value?.build?.version) {
      fail('WDA /status responded but without a build version');
    }
    console.log(
      `WDA ${parsed.value.build.version} ready on http://${wdaHost}:${wdaPort}`,
    );
  } catch {
    fail(
      `WebDriverAgent is not responding on http://${wdaHost}:${wdaPort}/status`,
    );
  }
}

async function time<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  const result = await fn();
  return [result, Date.now() - started];
}

async function main() {
  preflight();

  console.log(`Benchmark app: ${benchApp}`);
  const runs: TimedRun[] = [];
  const treeStats: Record<string, string | number> = {};

  // --- Bootstrap -----------------------------------------------------------
  const device = new IOSDevice({ wdaPort, wdaHost });
  await device.connect();
  await device.launch(benchApp);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const backend = (device as unknown as { wdaBackend: IOSWebDriverClient })
    .wdaBackend;

  // --- P0 warmup -----------------------------------------------------------
  await device.getUITree();

  // --- P1 cold: cache off, every call fetches + prunes ---------------------
  const coldSamples: number[] = [];
  for (let i = 0; i < COLD_ITERATIONS; i += 1) {
    const [, ms] = await time(() => device.getUITree());
    coldSamples.push(ms);
  }
  runs.push({ label: 'P1 getUITree (cache off)', samples: coldSamples });

  // Fetch/trim split + tree size stats on a fresh capture.
  const [source, fetchMs] = await time(() => backend.getAccessibilitySource());
  const [, trimMs] = await time(() =>
    Promise.resolve(wdaSourceToUiNode(source)),
  );
  const trimmedRoot = wdaSourceToUiNode(source);
  const rawBytes = JSON.stringify(source).length;
  Object.assign(treeStats, {
    rawBytes,
    rawNodes: countWdaSourceNodes(source),
    trimmedNodes: countUiNodes(trimmedRoot),
    fetchMs,
    trimMs,
  });
  runs.push({
    label: 'P1a fetch /source only',
    samples: [fetchMs],
    note: 'single sample',
  });
  runs.push({
    label: 'P1b prune in memory',
    samples: [trimMs],
    note: 'single sample',
  });

  // --- P5 screenshot baseline (same device, before any second session) -----
  // Measured on the first device only: WDA multi-session interactions can
  // tear down an earlier session's screenshot capability, and the baseline
  // only needs one device anyway.
  try {
    const shotSamples: number[] = [];
    for (let i = 0; i < SCREENSHOT_ITERATIONS; i += 1) {
      const [, ms] = await time(() => device.screenshotBase64());
      shotSamples.push(ms);
    }
    runs.push({
      label: 'P5 screenshotBase64 (current loop cost)',
      samples: shotSamples,
    });
  } catch (error) {
    runs.push({
      label: 'P5 screenshotBase64 (current loop cost)',
      samples: [],
      note: `failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // --- P2 cache on: one miss, then hits ------------------------------------
  const cachedDevice = new IOSDevice({
    wdaPort,
    wdaHost,
    axTree: { cache: { enabled: true } },
  } as ConstructorParameters<typeof IOSDevice>[0]);
  await cachedDevice.connect();
  const [, missMs] = await time(() => cachedDevice.getUITree());
  const hitSamples: number[] = [];
  for (let i = 0; i < CACHE_HIT_ITERATIONS; i += 1) {
    const [, ms] = await time(() => cachedDevice.getUITree());
    hitSamples.push(ms);
  }
  runs.push({
    label: 'P2 getUITree cache miss',
    samples: [missMs],
    note: 'single sample',
  });
  runs.push({ label: 'P2 getUITree cache hit', samples: hitSamples });

  // --- P3 invalidation: action dirties the cache ---------------------------
  const cachedBackend = (
    cachedDevice as unknown as { wdaBackend: IOSWebDriverClient }
  ).wdaBackend;
  let fetchCalls = 0;
  const original = cachedBackend.getAccessibilitySource.bind(cachedBackend);
  cachedBackend.getAccessibilitySource = (() => {
    fetchCalls += 1;
    return original();
  }) as IOSWebDriverClient['getAccessibilitySource'];

  const invalidationSamples: number[] = [];
  for (let round = 0; round < INVALIDATION_ROUNDS; round += 1) {
    await cachedDevice.launch(benchApp); // idempotent foreground, invalidates
    const [, ms] = await time(() => cachedDevice.getUITree());
    invalidationSamples.push(ms);
  }
  runs.push({
    label: 'P3 getUITree after launch invalidation',
    samples: invalidationSamples,
    note: `${fetchCalls} refetch(es) after ${INVALIDATION_ROUNDS} actions`,
  });

  // --- P4 pruning strategies (same raw source, in-memory) ------------------
  const strategies: {
    label: string;
    opts: Parameters<typeof wdaSourceToUiNode>[1];
  }[] = [
    { label: 'visible-only, depth 30 (default)', opts: {} },
    { label: 'include invisible, depth 30', opts: { includeInvisible: true } },
    { label: 'visible-only, depth 15', opts: { maxDepth: 15 } },
    {
      label: 'include invisible, depth 50',
      opts: { includeInvisible: true, maxDepth: 50 },
    },
  ];
  const strategyRows: { label: string; nodes: number; trimMs: number }[] = [];
  for (const strategy of strategies) {
    const [root, ms] = await time(() =>
      Promise.resolve(wdaSourceToUiNode(source, strategy.opts)),
    );
    strategyRows.push({
      label: strategy.label,
      nodes: countUiNodes(root),
      trimMs: ms,
    });
  }

  // --- Report ---------------------------------------------------------------
  console.log('\n## Timing (ms)\n');
  console.log(fmt(['phase', 'mean', 'min', 'p50', 'p95', 'note']));
  console.log(fmt(['---', '---', '---', '---', '---', '---']));
  for (const run of runs) {
    const s = stats(run.samples);
    console.log(fmt([run.label, s.mean, s.min, s.p50, s.p95, run.note ?? '']));
  }

  console.log('\n## Tree stats (single fresh capture)\n');
  console.log(fmt(['metric', 'value']));
  console.log(fmt(['---', '---']));
  for (const [key, value] of Object.entries(treeStats)) {
    console.log(fmt([key, value]));
  }

  console.log('\n## Pruning strategies (same raw source)\n');
  console.log(fmt(['strategy', 'nodes', 'trim ms']));
  console.log(fmt(['---', '---', '---']));
  for (const row of strategyRows) {
    console.log(fmt([row.label, row.nodes, row.trimMs]));
  }

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          app: benchApp,
          wda: { host: wdaHost, port: wdaPort },
          runs: runs.map((run) => ({
            label: run.label,
            ...stats(run.samples),
            samples: run.samples,
            note: run.note,
          })),
          treeStats,
          pruningStrategies: strategyRows,
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${jsonOut}`);
  }

  await cachedDevice.destroy();
  await device.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
