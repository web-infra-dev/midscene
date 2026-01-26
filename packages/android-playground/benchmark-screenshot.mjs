#!/usr/bin/env node
/**
 * Screenshot performance benchmark
 * Compares scrcpy vs ADB screenshot methods
 */

import { execSync } from 'node:child_process';
import { AndroidDevice } from '@midscene/android';

async function getDeviceId() {
  try {
    const output = execSync('adb devices -l', { encoding: 'utf-8' });
    const lines = output
      .split('\n')
      .filter((line) => line.trim() && !line.includes('List of devices'));
    if (lines.length === 0) {
      throw new Error('No Android devices connected');
    }
    const deviceId = lines[0].split(/\s+/)[0];
    return deviceId;
  } catch (error) {
    throw new Error(`Failed to get device ID: ${error.message}`);
  }
}

async function benchmark() {
  console.log('=== Screenshot Performance Benchmark ===\n');

  const deviceId = await getDeviceId();
  console.log(`Using device: ${deviceId}\n`);

  // Test with scrcpy enabled (using default config for best performance)
  console.log('Testing with scrcpy enabled...');
  const deviceScrcpy = new AndroidDevice(deviceId, {
    scrcpyConfig: {
      enabled: true,
      // Using default values: maxSize=1024, videoBitRate=2Mbps
    },
  });

  await deviceScrcpy.connect();
  const scrcpyTimes = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await deviceScrcpy.screenshotBase64();
    const elapsed = Date.now() - start;
    scrcpyTimes.push(elapsed);
    console.log(`  Screenshot ${i + 1}: ${elapsed}ms`);
  }

  await deviceScrcpy.destroy();

  // Test with ADB (scrcpy disabled)
  console.log('\nTesting with ADB method...');
  const deviceAdb = new AndroidDevice(deviceId, {
    scrcpyConfig: { enabled: false },
  });

  await deviceAdb.connect();
  const adbTimes = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await deviceAdb.screenshotBase64();
    const elapsed = Date.now() - start;
    adbTimes.push(elapsed);
    console.log(`  Screenshot ${i + 1}: ${elapsed}ms`);
  }

  await deviceAdb.destroy();

  // Calculate statistics
  const avgScrcpy = scrcpyTimes.reduce((a, b) => a + b, 0) / scrcpyTimes.length;
  const avgAdb = adbTimes.reduce((a, b) => a + b, 0) / adbTimes.length;

  console.log('\n=== Results ===');
  console.log(`Scrcpy average: ${avgScrcpy.toFixed(0)}ms`);
  console.log(`ADB average: ${avgAdb.toFixed(0)}ms`);

  const speedup = avgAdb / avgScrcpy;
  const percentFaster = ((avgAdb - avgScrcpy) / avgAdb) * 100;

  if (speedup > 1) {
    console.log(
      `\nScrcpy is ${speedup.toFixed(2)}x faster (${percentFaster.toFixed(1)}% faster than ADB)`,
    );
  } else {
    console.log(
      `\nADB is ${(1 / speedup).toFixed(2)}x faster (scrcpy ${(percentFaster * -1).toFixed(1)}% slower)`,
    );
  }

  console.log('\nNote: First scrcpy screenshot includes connection overhead');
  if (scrcpyTimes.length > 1) {
    const avgScrcpyExceptFirst =
      scrcpyTimes.slice(1).reduce((a, b) => a + b, 0) /
      (scrcpyTimes.length - 1);
    const warmSpeedup = avgAdb / avgScrcpyExceptFirst;
    console.log(
      `Scrcpy average (excluding first): ${avgScrcpyExceptFirst.toFixed(0)}ms`,
    );
    console.log(`Speedup (warm cache): ${warmSpeedup.toFixed(2)}x faster`);
  }

  console.log('\n=== Breakdown ===');
  console.log('Scrcpy times:', scrcpyTimes.map((t) => `${t}ms`).join(', '));
  console.log('ADB times:   ', adbTimes.map((t) => `${t}ms`).join(', '));
}

benchmark().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
