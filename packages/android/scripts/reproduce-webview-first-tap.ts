import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AndroidDevice } from '../src/device';

const TAG = 'MidsceneTapRepro';
const PACKAGE_NAME = 'io.midscene.taprepro';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(
  scriptDir,
  '../tests/fixtures/webview-tap-repro',
);
const defaultApkPath = path.join(
  fixtureDir,
  '.temp/webview-tap-repro-debug.apk',
);

interface RunnerOptions {
  apkPath: string;
  build: boolean;
  deviceId?: string;
  install: boolean;
  iterations: number;
  mode: 'deterministic' | 'natural';
  waitMs: number;
}

interface BaseCaseResult {
  firstAttemptTapCount: number;
  firstAttemptScreenshot: string;
  firstAttemptSwallowed: boolean;
  runId: string;
}

interface LegacySwipeCaseResult extends BaseCaseResult {
  caseName: 'legacy-swipe';
  secondAttemptScreenshot: string;
  secondAttemptTapCount: number;
}

interface NativeTapCaseResult extends BaseCaseResult {
  caseName: 'native-tap';
}

type CaseResult = LegacySwipeCaseResult | NativeTapCaseResult;

function readOptionValue(
  argv: string[],
  optionIndex: number,
  optionName: string,
): string {
  const value = argv[optionIndex + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

export function parseArgs(argv: string[]): RunnerOptions {
  const options: RunnerOptions = {
    apkPath: defaultApkPath,
    build: true,
    install: true,
    iterations: 1,
    mode: 'deterministic',
    waitMs: 500,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      // pnpm may forward its argument separator to package scripts.
    } else if (argument === '--device-id') {
      options.deviceId = readOptionValue(argv, index, argument);
      index += 1;
    } else if (argument === '--apk') {
      options.apkPath = path.resolve(readOptionValue(argv, index, argument));
      options.build = false;
      index += 1;
    } else if (argument === '--iterations') {
      options.iterations = Number(readOptionValue(argv, index, argument));
      index += 1;
    } else if (argument === '--wait-ms') {
      options.waitMs = Number(readOptionValue(argv, index, argument));
      index += 1;
    } else if (argument === '--mode') {
      const mode = readOptionValue(argv, index, argument);
      if (mode !== 'deterministic' && mode !== 'natural') {
        throw new Error('--mode must be deterministic or natural');
      }
      options.mode = mode;
      index += 1;
    } else if (argument === '--no-build') {
      options.build = false;
    } else if (argument === '--no-install') {
      options.install = false;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new Error('--iterations must be a positive integer');
  }
  if (!Number.isFinite(options.waitMs) || options.waitMs < 0) {
    throw new Error('--wait-ms must be a non-negative number');
  }
  return options;
}

function execute(
  command: string,
  args: string[],
  options: { print?: boolean } = {},
): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (options.print && output) console.log(output);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(' ')}\n${output}`,
    );
  }
  return output;
}

function adb(deviceId: string, args: string[]): string {
  return execute('adb', ['-s', deviceId, ...args]);
}

function connectedDevices(): string[] {
  return execute('adb', ['devices'])
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([deviceId]) => deviceId);
}

function resolveDeviceId(explicitDeviceId?: string): string {
  const devices = connectedDevices();
  if (explicitDeviceId) {
    if (!devices.includes(explicitDeviceId)) {
      throw new Error(
        `Android device ${explicitDeviceId} is not connected. Connected devices: ${devices.join(', ') || 'none'}`,
      );
    }
    return explicitDeviceId;
  }
  if (devices.length !== 1) {
    throw new Error(
      `Expected exactly one connected Android device, found ${devices.length}. Pass --device-id.`,
    );
  }
  return devices[0];
}

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

function caseLogs(deviceId: string): string {
  return adb(deviceId, ['logcat', '-d', '-s', `${TAG}:I`, '*:S']);
}

export function tapCountForRun(logs: string, runId: string): number {
  const matches = Array.from(
    logs.matchAll(
      new RegExp(
        `run=${runId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} tap_count=(\\d+)`,
        'g',
      ),
    ),
  );
  return matches.length ? Number(matches.at(-1)?.[1]) : 0;
}

async function waitForLog(
  deviceId: string,
  pattern: string,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let logs = '';
  while (Date.now() < deadline) {
    logs = caseLogs(deviceId);
    if (logs.includes(pattern)) return logs;
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for log ${JSON.stringify(pattern)}\n${logs}`,
  );
}

async function launchCase(
  deviceId: string,
  runId: string,
  guardEnabled: boolean,
): Promise<void> {
  adb(deviceId, ['logcat', '-c']);
  const uri = `midscene-tap-repro://open?run=${encodeURIComponent(runId)}&guard=${guardEnabled ? '1' : '0'}`;
  // Quotes must be part of the argument passed to ADB because `adb shell`
  // rebuilds a remote shell command. Local-only quoting does not protect `&`
  // from the device shell.
  const shellQuotedUri = `'${uri}'`;
  adb(deviceId, [
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    shellQuotedUri,
    PACKAGE_NAME,
  ]);
  await waitForLog(deviceId, `run=${runId} ready`);
  const focusedWindow = adb(deviceId, ['shell', 'dumpsys', 'window']);
  const currentFocus =
    focusedWindow.match(/^\s*mCurrentFocus=.*$/m)?.[0] ??
    'mCurrentFocus missing';
  if (!currentFocus.includes(PACKAGE_NAME)) {
    throw new Error(
      `Reproduction fixture is not foreground after deeplink: ${currentFocus}`,
    );
  }
}

async function captureScreenshot(
  deviceId: string,
  destination: string,
): Promise<void> {
  const result = spawnSync('adb', [
    '-s',
    deviceId,
    'exec-out',
    'screencap',
    '-p',
  ]);
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout?.length) {
    throw new Error(`Failed to capture screenshot for ${deviceId}`);
  }
  await writeFile(destination, result.stdout);
}

function physicalScreenCenter(deviceId: string): { x: number; y: number } {
  const output = adb(deviceId, ['shell', 'wm', 'size']);
  const override = /Override size:\s*(\d+)x(\d+)/.exec(output);
  const physical = /Physical size:\s*(\d+)x(\d+)/.exec(output);
  const match = override ?? physical;
  if (!match)
    throw new Error(`Unable to parse Android screen size:\n${output}`);
  return {
    x: Math.round(Number(match[1]) / 2),
    y: Math.round(Number(match[2]) / 2),
  };
}

async function runLegacySwipeCase(
  deviceId: string,
  runId: string,
  guardEnabled: boolean,
  waitMs: number,
  outputDir: string,
): Promise<LegacySwipeCaseResult> {
  await launchCase(deviceId, runId, guardEnabled);
  const center = physicalScreenCenter(deviceId);
  adb(deviceId, [
    'shell',
    'input',
    'swipe',
    String(center.x),
    String(center.y),
    String(center.x),
    String(center.y),
    '150',
  ]);
  await sleep(waitMs);
  let logs = caseLogs(deviceId);
  const firstAttemptTapCount = tapCountForRun(logs, runId);
  const firstAttemptSwallowed = logs.includes(`run=${runId} guard_swallowed`);
  const firstAttemptScreenshot = path.join(outputDir, `${runId}-first.png`);
  await captureScreenshot(deviceId, firstAttemptScreenshot);

  adb(deviceId, [
    'shell',
    'input',
    'swipe',
    String(center.x),
    String(center.y),
    String(center.x),
    String(center.y),
    '150',
  ]);
  await sleep(waitMs);
  logs = caseLogs(deviceId);
  const secondAttemptTapCount = tapCountForRun(logs, runId);
  const secondAttemptScreenshot = path.join(outputDir, `${runId}-second.png`);
  await captureScreenshot(deviceId, secondAttemptScreenshot);
  return {
    caseName: 'legacy-swipe',
    firstAttemptTapCount,
    firstAttemptScreenshot,
    firstAttemptSwallowed,
    runId,
    secondAttemptScreenshot,
    secondAttemptTapCount,
  };
}

async function runNativeTapCase(
  device: AndroidDevice,
  deviceId: string,
  runId: string,
  guardEnabled: boolean,
  waitMs: number,
  outputDir: string,
): Promise<NativeTapCaseResult> {
  await launchCase(deviceId, runId, guardEnabled);
  const size = await device.size();
  await device.inputPrimitives.pointer.tap({
    x: Math.round(size.width / 2),
    y: Math.round(size.height / 2),
  });
  await sleep(waitMs);
  const logs = caseLogs(deviceId);
  const firstAttemptScreenshot = path.join(outputDir, `${runId}-first.png`);
  await captureScreenshot(deviceId, firstAttemptScreenshot);
  return {
    caseName: 'native-tap',
    firstAttemptTapCount: tapCountForRun(logs, runId),
    firstAttemptScreenshot,
    firstAttemptSwallowed: logs.includes(`run=${runId} guard_swallowed`),
    runId,
  };
}

export function assertDeterministicResults(results: CaseResult[]): void {
  for (const result of results) {
    if (
      result.caseName === 'legacy-swipe' &&
      !(
        result.firstAttemptTapCount === 0 &&
        result.firstAttemptSwallowed &&
        result.secondAttemptTapCount >= 1
      )
    ) {
      throw new Error(
        `Legacy swipe did not reproduce the expected first-attempt failure: ${JSON.stringify(result)}`,
      );
    }
    if (
      result.caseName === 'native-tap' &&
      (result.firstAttemptTapCount < 1 || result.firstAttemptSwallowed)
    ) {
      throw new Error(
        `Native tap did not succeed on the first attempt: ${JSON.stringify(result)}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.build) {
    execute(
      process.execPath,
      [path.join(scriptDir, 'build-webview-tap-repro.mjs')],
      { print: true },
    );
  }

  const deviceId = resolveDeviceId(options.deviceId);
  if (options.install) {
    execute('adb', ['-s', deviceId, 'install', '-r', options.apkPath], {
      print: true,
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(fixtureDir, '.temp/results', timestamp);
  await mkdir(outputDir, { recursive: true });
  const guardEnabled = options.mode === 'deterministic';
  // Use the same PATH-resolved adb binary as the raw comparison commands.
  // This also keeps the fixture independent from a globally configured SDK.
  const device = new AndroidDevice(deviceId, { androidAdbPath: 'adb' });
  const results: CaseResult[] = [];

  try {
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      results.push(
        await runLegacySwipeCase(
          deviceId,
          `legacy-${iteration}`,
          guardEnabled,
          options.waitMs,
          outputDir,
        ),
      );
      results.push(
        await runNativeTapCase(
          device,
          deviceId,
          `native-${iteration}`,
          guardEnabled,
          options.waitMs,
          outputDir,
        ),
      );
    }
  } finally {
    await device.destroy();
  }

  const summary = {
    deviceId,
    mode: options.mode,
    generatedAt: new Date().toISOString(),
    results,
  };
  const resultPath = path.join(outputDir, 'result.json');
  await writeFile(resultPath, `${JSON.stringify(summary, null, 2)}\n`);

  if (guardEnabled) {
    assertDeterministicResults(results);
  }

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Reproduction result: ${resultPath}`);
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
