// Native device integration test. The fixture only measures content offsets;
// all gestures run through the built SDK's Scroll action, without an AI model.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
assert(['android', 'ios'].includes(platform), 'Pass android or ios');
const output = path.resolve(
  process.env[`MIDSCENE_${platform.toUpperCase()}_DIAGNOSTICS_DIR`] ??
    path.join(root, 'midscene_run', `${platform}-scroll`),
  'scroll',
);
mkdirSync(output, { recursive: true });
for (const name of [
  'summary.json',
  'failure.json',
  'results.json',
  'environment.json',
]) {
  rmSync(path.join(output, name), { force: true });
}
const bundle = 'dev.midscene.scrollprobe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (command, args) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const save = (name, data) =>
  writeFileSync(path.join(output, name), `${JSON.stringify(data, null, 2)}\n`);
let device;
let serial;
let container;
let session;
let previousOrientation;
let previousSize;
let previousDensity;
const wdaUrl = `http://127.0.0.1:${process.env.MIDSCENE_IOS_WDA_PORT ?? 8100}`;
const udid = process.env.MIDSCENE_IOS_SIMULATOR_UDID;
const adb = (...args) => run('adb', ['-s', serial, ...args]);
async function wda(route, body) {
  const response = await fetch(`${wdaUrl}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  assert(response.ok && !result.value?.error, JSON.stringify(result));
  return result;
}
function metrics() {
  return JSON.parse(
    platform === 'ios'
      ? readFileSync(path.join(container, 'Documents/metrics.json'), 'utf8')
      : adb('shell', 'run-as', bundle, 'cat', 'files/metrics.json'),
  );
}
async function poll(check, label, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError });
}
async function reset(mode) {
  if (platform === 'ios') {
    // A terminated fixture has no previous process writing stale measurements.
    try {
      run('xcrun', ['simctl', 'terminate', udid, bundle]);
    } catch {
      /* not running */
    }
    rmSync(path.join(container, 'Documents/metrics.json'), { force: true });
    run('xcrun', ['simctl', 'launch', udid, bundle, mode]);
  } else {
    adb('shell', 'am', 'force-stop', bundle);
    adb('shell', 'run-as', bundle, 'rm', '-f', 'files/metrics.json');
    adb(
      'shell',
      'am',
      'start',
      '-n',
      `${bundle}/.MainActivity`,
      '--es',
      'mode',
      mode,
    );
  }
  return poll(() => {
    const value = metrics();
    const offset = mode === 'horizontal' ? value.x : value.y;
    return (
      value.mode === mode &&
      value.samples.at(-1).t > 0.5 &&
      Math.abs(offset - value.initial) < 0.5 &&
      value
    );
  }, `fixture reset (${mode})`);
}
async function settled(before) {
  let last;
  let stable = 0;
  let sampleTime = before.samples.at(-1).t;
  return poll(() => {
    const value = metrics();
    const sample = value.samples.at(-1);
    // A stale file or stopped fixture must never satisfy the stability check.
    if (sample.t <= sampleTime) return false;
    sampleTime = sample.t;
    stable =
      last &&
      Math.abs(value.x - last.x) < 0.5 &&
      Math.abs(value.y - last.y) < 0.5
        ? stable + 1
        : 0;
    last = value;
    return stable >= 12 && !sample.dragging && !sample.decelerating && value;
  }, 'content settling');
}
function screenshot(name) {
  const target = path.join(output, `${name}.png`);
  if (platform === 'ios')
    run('xcrun', ['simctl', 'io', udid, 'screenshot', target]);
  else
    writeFileSync(
      target,
      execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], {
        timeout: 30_000,
      }),
    );
}
const results = [];
try {
  run('bash', [
    path.join(root, `packages/${platform}/scripts/build-scroll-probe.sh`),
    path.join(output, 'fixture'),
  ]);
  if (platform === 'android') {
    serial = process.env.MIDSCENE_ANDROID_SERIAL;
    if (!serial) {
      const emulators = run('adb', ['devices'])
        .split('\n')
        .filter((line) => /^emulator-\d+\s+device$/.test(line))
        .map((line) => line.split(/\s/)[0]);
      assert.equal(
        emulators.length,
        1,
        'Set MIDSCENE_ANDROID_SERIAL when multiple emulators are connected',
      );
      [serial] = emulators;
    }
    assert(
      serial.startsWith('emulator-'),
      'The fixture runner requires an emulator',
    );
    previousDensity =
      adb('shell', 'wm', 'density').match(/Override density: (\d+)/)?.[1] ??
      'reset';
    previousSize =
      adb('shell', 'wm', 'size').match(/Override size: (\d+x\d+)/)?.[1] ??
      'reset';
    if (
      adb('shell', 'pm', 'list', 'packages', bundle)
        .split('\n')
        .includes(`package:${bundle}`)
    ) {
      adb('uninstall', bundle);
    }
    adb('install', '-r', path.join(output, 'fixture/probe.apk'));
    // Keep system insets and fixture pixels reproducible across emulator profiles.
    adb('shell', 'wm', 'density', '160');
    const { AndroidDevice } = await import(
      '../packages/android/dist/es/index.mjs'
    );
    // wm size changes physical dimensions between cases; refresh cached display info.
    device = new AndroidDevice(serial, { alwaysRefreshScreenInfo: true });
  } else {
    assert(udid, 'Set MIDSCENE_IOS_SIMULATOR_UDID');
    run('xcrun', [
      'simctl',
      'install',
      udid,
      path.join(output, 'fixture/ScrollProbe.app'),
    ]);
    container = run('xcrun', [
      'simctl',
      'get_app_container',
      udid,
      bundle,
      'data',
    ]);
    const response = await wda('/session', {
      capabilities: { alwaysMatch: { bundleId: bundle } },
    });
    session = response.sessionId ?? response.value?.sessionId;
    assert(session, 'WDA did not return a session');
    previousOrientation = (await wda(`/session/${session}/orientation`)).value;
    const { IOSDevice } = await import('../packages/ios/dist/es/index.mjs');
    device = new IOSDevice({
      wdaPort: Number(process.env.MIDSCENE_IOS_WDA_PORT ?? 8100),
      sessionId: session,
    });
  }
  save('environment.json', {
    platform,
    serial,
    udid,
    commit: run('git', ['-C', root, 'rev-parse', 'HEAD']),
    sourceDiff: run('git', [
      '-C',
      root,
      'diff',
      '--',
      `packages/${platform}/src`,
    ]),
  });
  const action = device.actionSpace().find(({ name }) => name === 'Scroll');
  assert(action, 'SDK does not expose Scroll');
  for (const orientation of ['portrait', 'landscape']) {
    if (platform === 'android')
      adb(
        'shell',
        'wm',
        'size',
        orientation === 'portrait' ? '320x640' : '640x320',
      );
    else {
      await reset('vertical');
      await wda(`/session/${session}/orientation`, {
        orientation: orientation.toUpperCase(),
      });
    }
    for (const [mode, directions] of [['vertical', ['down']]]) {
      for (const direction of directions) {
        for (
          let trial = 1;
          trial <= 12;
          trial++
        ) {
          const calibration = ['baseline', 'min1000', 'min1500', 'hold100'][Math.floor((trial - 1) / 3)];
          const name = `${orientation}-${mode}-${direction}-${trial}`;
          const before = await reset(mode);
          const size = await device.size();
          assert.equal(
            before.width > before.height,
            orientation === 'landscape',
            `Wrong fixture orientation: ${name}`,
          );
          assert.equal(
            size.width > size.height,
            orientation === 'landscape',
            `Wrong SDK orientation: ${name}`,
          );
          assert.equal(
            size.width,
            before.width,
            'Fixture and SDK coordinate widths differ',
          );
          if (platform === 'ios')
            assert.equal(
              size.height,
              before.height,
              'Fixture and SDK coordinate heights differ',
            );
          screenshot(`${name}-before`);
          let after;
          try {
            const fromY = Math.round(size.height * 0.875);
            const toY = Math.round(size.height * 0.125);
            const duration = Math.max(calibration === 'min1000' ? 1000 : calibration === 'min1500' ? 1500 : 1, Math.round((fromY-toY)/0.4));
            const pointerActions = [
              {type:'pointerMove',duration:0,x:Math.round(size.width/2),y:fromY},
              {type:'pointerDown',button:0},{type:'pause',duration:100},
              {type:'pointerMove',duration,x:Math.round(size.width/2),y:toY},
              ...(calibration === 'hold100' ? [{type:'pause',duration:100}] : []),
              {type:'pointerUp',button:0}
            ];
            await wda(`/session/${session}/actions`, {actions:[{type:'pointer',id:'finger1',parameters:{pointerType:'touch'},actions:pointerActions}]});
            after = await settled(before);
            const axis = mode === 'horizontal' ? 'x' : 'y';
            const extent = mode === 'horizontal' ? before.width : before.height;
            const delta = after[axis] - before[axis];
            const fraction =
              (delta / extent) * (['up', 'left'].includes(direction) ? -1 : 1);
            const result = { name, calibration, delta, fraction, extent };
            results.push(result);
            save(`${name}.json`, { before, after, size, ...result });
            console.log(JSON.stringify(result));
          } finally {
            screenshot(`${name}-after`);
            save('results.json', results);
          }
          console.log(`${name}: PASS`);
        }
      }
    }
  }
  save('summary.json', { diagnosticOnly: true, trials: results.length });
} catch (error) {
  save('failure.json', {
    message: error.message,
    stack: error.stack,
    cause: String(error.cause ?? ''),
  });
  throw error;
} finally {
  try {
    if (platform === 'android' && previousSize) {
      try {
        adb('shell', 'wm', 'size', previousSize);
      } finally {
        if (previousDensity) adb('shell', 'wm', 'density', previousDensity);
      }
    }
    if (platform === 'ios' && previousOrientation)
      await wda(`/session/${session}/orientation`, {
        orientation: previousOrientation,
      });
  } finally {
    await device?.destroy();
  }
}
