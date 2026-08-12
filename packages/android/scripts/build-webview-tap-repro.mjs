import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(
  scriptDir,
  '../tests/fixtures/webview-tap-repro',
);
const outputDir = path.join(fixtureDir, '.temp');
const buildDir = path.join(outputDir, 'build');
const classesDir = path.join(buildDir, 'classes');
const dexDir = path.join(buildDir, 'dex');
const apkPath = path.join(outputDir, 'webview-tap-repro-debug.apk');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      // pnpm may forward its argument separator to package scripts.
    } else if (argument === '--sdk-root') {
      args.sdkRoot = readOptionValue(argv, index, argument);
      index += 1;
    } else if (argument === '--java-home') {
      args.javaHome = readOptionValue(argv, index, argument);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return args;
}

function readOptionValue(argv, optionIndex, optionName) {
  const value = argv[optionIndex + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(' ')}`,
    );
  }
}

async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveJavaHome(explicitJavaHome) {
  const candidates = [explicitJavaHome, process.env.JAVA_HOME].filter(Boolean);
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/libexec/java_home', ['-v', '17'], {
      encoding: 'utf8',
    });
    if (result.status === 0 && result.stdout.trim()) {
      candidates.push(result.stdout.trim());
    }
  }

  for (const candidate of candidates) {
    if (await isExecutable(path.join(candidate, 'bin', 'javac'))) {
      return path.resolve(candidate);
    }
  }

  throw new Error(
    'JDK 17 was not found. Set JAVA_HOME or pass --java-home <path>.',
  );
}

async function resolveSdkRoot(explicitSdkRoot) {
  const candidates = [
    explicitSdkRoot,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === 'darwin'
      ? path.join(process.env.HOME ?? '', 'Library/Android/sdk')
      : path.join(process.env.HOME ?? '', 'Android/Sdk'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'platforms'));
      await access(path.join(candidate, 'build-tools'));
      return path.resolve(candidate);
    } catch {
      // Try the next conventional SDK location.
    }
  }

  throw new Error(
    'Android SDK platforms/build-tools were not found. Set ANDROID_HOME or pass --sdk-root <path>.',
  );
}

function versionParts(version) {
  return version.split(/[.-]/).map((part) => Number(part) || 0);
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function latestDirectory(parent, filter) {
  const entries = await readdir(parent, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && filter(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersions);
  const latest = names.at(-1);
  if (!latest) {
    throw new Error(`No compatible directory found under ${parent}`);
  }
  return path.join(parent, latest);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const javaHome = await resolveJavaHome(args.javaHome);
  const sdkRoot = await resolveSdkRoot(args.sdkRoot);
  const platformDir = await latestDirectory(
    path.join(sdkRoot, 'platforms'),
    (name) => /^android-\d+$/.test(name),
  );
  const buildToolsDir = await latestDirectory(
    path.join(sdkRoot, 'build-tools'),
    (name) => /^\d+(?:\.\d+)*$/.test(name),
  );
  const targetApi = path.basename(platformDir).replace('android-', '');
  const androidJar = path.join(platformDir, 'android.jar');
  const javaBin = path.join(javaHome, 'bin');
  const aapt2 = path.join(buildToolsDir, 'aapt2');
  const d8 = path.join(buildToolsDir, 'd8');
  const zipalign = path.join(buildToolsDir, 'zipalign');
  const apksigner = path.join(buildToolsDir, 'apksigner');

  for (const executable of [aapt2, d8, zipalign, apksigner]) {
    if (!(await isExecutable(executable))) {
      throw new Error(`Required Android build tool is missing: ${executable}`);
    }
  }

  await rm(buildDir, { recursive: true, force: true });
  await mkdir(classesDir, { recursive: true });
  await mkdir(dexDir, { recursive: true });

  const resourcesApk = path.join(buildDir, 'resources.apk');
  run(aapt2, [
    'link',
    '-o',
    resourcesApk,
    '-I',
    androidJar,
    '--manifest',
    path.join(fixtureDir, 'AndroidManifest.xml'),
    '--min-sdk-version',
    '23',
    '--target-sdk-version',
    targetApi,
    '-A',
    path.join(fixtureDir, 'assets'),
  ]);

  const javaSource = path.join(
    fixtureDir,
    'src/io/midscene/taprepro/MainActivity.java',
  );
  run(path.join(javaBin, 'javac'), [
    '-encoding',
    'UTF-8',
    '-source',
    '7',
    '-target',
    '7',
    '-Xlint:-options',
    '-bootclasspath',
    androidJar,
    '-d',
    classesDir,
    javaSource,
  ]);

  const classesJar = path.join(buildDir, 'classes.jar');
  run(path.join(javaBin, 'jar'), [
    '--create',
    '--file',
    classesJar,
    '-C',
    classesDir,
    '.',
  ]);
  run(d8, [
    '--lib',
    androidJar,
    '--min-api',
    '23',
    '--output',
    dexDir,
    classesJar,
  ]);

  const unsignedApk = path.join(buildDir, 'unsigned.apk');
  await copyFile(resourcesApk, unsignedApk);
  run(path.join(javaBin, 'jar'), [
    '--update',
    '--file',
    unsignedApk,
    '-C',
    dexDir,
    'classes.dex',
  ]);

  const alignedApk = path.join(buildDir, 'aligned.apk');
  run(zipalign, ['-f', '4', unsignedApk, alignedApk]);

  const keystore = path.join(outputDir, 'debug.keystore');
  try {
    await access(keystore);
  } catch {
    await mkdir(outputDir, { recursive: true });
    run(path.join(javaBin, 'keytool'), [
      '-genkeypair',
      '-keystore',
      keystore,
      '-storepass',
      'android',
      '-alias',
      'androiddebugkey',
      '-keypass',
      'android',
      '-dname',
      'CN=Android Debug,O=Android,C=US',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
    ]);
  }

  await rm(apkPath, { force: true });
  run(apksigner, [
    'sign',
    '--ks',
    keystore,
    '--ks-pass',
    'pass:android',
    '--key-pass',
    'pass:android',
    '--out',
    apkPath,
    alignedApk,
  ]);
  run(apksigner, ['verify', '--verbose', apkPath]);

  console.log(`WebView tap reproduction APK: ${apkPath}`);
}

await main();
