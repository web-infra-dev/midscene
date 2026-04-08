#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(__dirname, '../midscene-ime');
const buildScript = path.resolve(sourceDir, 'build.sh');
const outputApk = path.resolve(__dirname, '../bin/midscene-ime.apk');
const argv = new Set(process.argv.slice(2));
const strict = argv.has('--strict');
const force = argv.has('--force');

const sourceInputs = [
  path.resolve(sourceDir, 'AndroidManifest.xml'),
  path.resolve(sourceDir, 'build.sh'),
  path.resolve(sourceDir, 'res'),
  path.resolve(sourceDir, 'src'),
];

function getLatestMtimeMs(targetPath) {
  const stats = statSync(targetPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latestMtimeMs = stats.mtimeMs;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.name === '.build') {
      continue;
    }
    latestMtimeMs = Math.max(
      latestMtimeMs,
      getLatestMtimeMs(path.join(targetPath, entry.name)),
    );
  }

  return latestMtimeMs;
}

function shouldBuildApk() {
  if (force || !existsSync(outputApk)) {
    return true;
  }

  const apkMtimeMs = statSync(outputApk).mtimeMs;
  const latestSourceMtimeMs = Math.max(
    ...sourceInputs.map((targetPath) => getLatestMtimeMs(targetPath)),
  );
  return latestSourceMtimeMs > apkMtimeMs;
}

function runBuild() {
  execFileSync('bash', [buildScript], {
    stdio: 'inherit',
    timeout: 60000,
  });
}

function main() {
  const shouldBuild = shouldBuildApk();
  if (!shouldBuild) {
    console.log('[midscene-ime] APK is up to date, skipping build');
    return;
  }

  console.log('[midscene-ime] Building MidsceneIME APK from source...');

  try {
    runBuild();
    if (!existsSync(outputApk)) {
      throw new Error(
        `Build script completed but ${outputApk} was not generated`,
      );
    }
    console.log('[midscene-ime] Built successfully');
  } catch (error) {
    if (strict) {
      throw new Error(
        `[midscene-ime] Build failed and strict mode is enabled: ${error.message}`,
      );
    }
    console.warn(
      `[midscene-ime] Build failed (Android SDK or JDK 11+ may not be available): ${error.message}`,
    );
    console.warn(
      '[midscene-ime] The midscene-ime keyboard dismiss feature will not be available in this local build.',
    );
  }
}

main();
