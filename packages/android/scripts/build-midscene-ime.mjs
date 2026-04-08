#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.resolve(__dirname, '../midscene-ime/build.sh');
const outputApk = path.resolve(__dirname, '../bin/midscene-ime.apk');

function main() {
  // Skip if APK already exists (e.g. checked in or previously built)
  if (existsSync(outputApk)) {
    console.log('[midscene-ime] APK already exists, skipping build');
    return;
  }

  console.log('[midscene-ime] Building MidsceneIME APK from source...');

  try {
    execSync(`bash "${buildScript}"`, {
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log('[midscene-ime] Built successfully');
  } catch (error) {
    console.warn(
      `[midscene-ime] Build failed (Android SDK or JDK 11+ may not be available): ${error.message}`,
    );
    console.warn(
      '[midscene-ime] The midscene-ime keyboard dismiss feature will not be available.',
    );
  }
}

main();
