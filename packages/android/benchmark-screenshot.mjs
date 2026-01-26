#!/usr/bin/env node
/**
 * Screenshot performance benchmark
 * Compares scrcpy vs ADB screenshot methods (full pipeline including resize)
 */

import { execSync } from 'node:child_process';
import { AndroidDevice } from '@midscene/android';
import { imageInfoOfBase64, resizeImgBase64 } from '@midscene/shared/img';

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

/**
 * Simulate Agent layer processing: screenshot + resize (if needed)
 */
async function getProcessedScreenshot(device) {
  // Get screenshot and size (like Agent does)
  const screenshot = await device.screenshotBase64();
  const sizeInfo = await device.size();

  // Check if resize is needed (like Agent does)
  const { width: screenshotWidth } = await imageInfoOfBase64(screenshot);
  const scale = screenshotWidth / sizeInfo.width;

  if (Math.abs(scale - 1.0) > 0.001) {
    // Agent will resize
    const resized = await resizeImgBase64(screenshot, {
      width: sizeInfo.width,
      height: sizeInfo.height,
    });
    return { screenshot: resized, resized: true };
  } else {
    // No resize needed
    return { screenshot, resized: false };
  }
}

async function benchmark() {
  console.log('=== Screenshot Performance Benchmark ===');
  console.log('(Full pipeline: Device screenshot + Agent resize)\n');

  const deviceId = await getDeviceId();
  console.log(`Using device: ${deviceId}\n`);

  // Test with scrcpy enabled
  console.log('Testing scrcpy (full pipeline)...');
  const deviceScrcpy = new AndroidDevice(deviceId, {
    scrcpyConfig: { enabled: true },
  });

  await deviceScrcpy.connect();
  await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait for connection

  const scrcpyTimes = [];
  let scrcpyResized = false;
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const result = await getProcessedScreenshot(deviceScrcpy);
    const elapsed = Date.now() - start;
    scrcpyTimes.push(elapsed);
    scrcpyResized = result.resized;
    console.log(`  Screenshot ${i + 1}: ${elapsed}ms`);
  }

  await deviceScrcpy.destroy();

  // Test with ADB
  console.log('\nTesting ADB (full pipeline)...');
  const deviceAdb = new AndroidDevice(deviceId, {
    scrcpyConfig: { enabled: false },
  });

  await deviceAdb.connect();
  const adbTimes = [];
  let adbResized = false;
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const result = await getProcessedScreenshot(deviceAdb);
    const elapsed = Date.now() - start;
    adbTimes.push(elapsed);
    adbResized = result.resized;
    console.log(`  Screenshot ${i + 1}: ${elapsed}ms`);
  }

  await deviceAdb.destroy();

  // Calculate statistics
  const avgScrcpy = scrcpyTimes.reduce((a, b) => a + b, 0) / scrcpyTimes.length;
  const avgAdb = adbTimes.reduce((a, b) => a + b, 0) / adbTimes.length;

  console.log('\n=== Results ===');
  console.log(
    `Scrcpy average: ${avgScrcpy.toFixed(0)}ms (resize: ${scrcpyResized ? 'YES ❌' : 'NO ✅'})`,
  );
  console.log(
    `ADB average:    ${avgAdb.toFixed(0)}ms (resize: ${adbResized ? 'YES ❌' : 'NO ✅'})`,
  );

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

  // Resolution info
  console.log('\n=== Resolution Info ===');
  const scrcpySize = await (async () => {
    const d = new AndroidDevice(deviceId, { scrcpyConfig: { enabled: true } });
    await d.connect();
    await new Promise((r) => setTimeout(r, 1500));
    const shot = await d.screenshotBase64();
    const size = await d.size();
    const { width, height } = await imageInfoOfBase64(shot);
    await d.destroy();
    return {
      screenshot: `${width}x${height}`,
      logical: `${size.width}x${size.height}`,
    };
  })();

  const adbSize = await (async () => {
    const d = new AndroidDevice(deviceId, { scrcpyConfig: { enabled: false } });
    await d.connect();
    const shot = await d.screenshotBase64();
    const size = await d.size();
    const { width, height } = await imageInfoOfBase64(shot);
    await d.destroy();
    return {
      screenshot: `${width}x${height}`,
      logical: `${size.width}x${size.height}`,
    };
  })();

  console.log(
    'Scrcpy: screenshot',
    scrcpySize.screenshot,
    '→ logical',
    scrcpySize.logical,
    scrcpyResized ? '(resized)' : '(no resize)',
  );
  console.log(
    'ADB:    screenshot',
    adbSize.screenshot,
    '→ logical',
    adbSize.logical,
    adbResized ? '(resized)' : '(no resize)',
  );
}

benchmark().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
