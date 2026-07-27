import type { ADB } from 'appium-adb';

/** Current on-disk schema for Android accessibility audit reports. */
export const ANDROID_AUDIT_SCHEMA_VERSION = 2 as const;

export type AndroidAuditReportKind = 'cli-capture' | 'playground-live';
export type AndroidAuditTechnologyConfidence =
  | 'confirmed'
  | 'strong'
  | 'suspected'
  | 'unknown';

export interface AndroidAuditTechnologyMetadata {
  confidence: AndroidAuditTechnologyConfidence;
  declaredStack: string;
  evidence: string[];
}

export interface AndroidAuditEnvironment {
  app: {
    activity: string;
    expectedPackage: string;
    package: string;
    versionCode: string;
    versionName: string;
  };
  device: {
    androidVersion: string;
    apiLevel: string;
    density: number;
    dpr: number;
    manufacturer: string;
    model: string;
    resolution: {
      logical: { width: number; height: number };
      override?: { width: number; height: number };
      physical: { width: number; height: number };
      screenshot: { width: number; height: number };
    };
    rotation: number;
    serial: string;
  };
}

export interface CollectAndroidAuditEnvironmentOptions {
  deviceId: string;
  expectedPackage?: string;
  logicalSize?: { width: number; height: number };
  rotation?: number;
  screenshotSize: { width: number; height: number };
}

function parseWmDimension(
  output: string,
  label: 'Physical' | 'Override',
): { width: number; height: number } | undefined {
  const match = output.match(new RegExp(`${label} size:\\s*(\\d+)x(\\d+)`));
  return match
    ? {
        width: Number.parseInt(match[1], 10),
        height: Number.parseInt(match[2], 10),
      }
    : undefined;
}

async function requiredShellValue(
  adb: ADB,
  command: string,
  label: string,
): Promise<string> {
  const value = (await adb.shell(command)).trim();
  if (!value) throw new Error(`Unable to read ${label} with: ${command}`);
  return value;
}

async function getRotation(adb: ADB): Promise<number> {
  const input = await adb.shell('dumpsys input');
  const inputMatch = input.match(/SurfaceOrientation:\s*(\d)/);
  if (inputMatch) return Number.parseInt(inputMatch[1], 10);
  const display = await adb.shell('dumpsys display');
  const displayMatch = display.match(/mCurrentOrientation=(\d)/);
  if (displayMatch) return Number.parseInt(displayMatch[1], 10);
  throw new Error('Unable to determine Android display rotation');
}

async function getFocusedApp(adb: ADB): Promise<{
  package: string;
  activity: string;
}> {
  const activityDump = await adb.shell('dumpsys activity activities');
  const activityLines = activityDump
    .split(/\r?\n/)
    .filter((line) =>
      /mResumedActivity|topResumedActivity|ResumedActivity/.test(line),
    );
  const windowDump = await adb.shell('dumpsys window windows');
  const windowLines = windowDump
    .split(/\r?\n/)
    .filter((line) => /mCurrentFocus|mFocusedApp/.test(line));
  for (const line of [...activityLines, ...windowLines]) {
    const match = line.match(/([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/);
    if (match) return { package: match[1], activity: match[2] };
  }
  throw new Error('Unable to determine the focused Android package/activity');
}

async function getAppVersion(
  adb: ADB,
  packageName: string,
): Promise<{ versionName: string; versionCode: string }> {
  if (!/^[A-Za-z0-9_.]+$/.test(packageName)) {
    throw new Error(`Invalid Android package name: ${packageName}`);
  }
  const dump = await adb.shell(`dumpsys package ${packageName}`);
  const versionName = dump.match(/\bversionName=([^\s]+)/)?.[1];
  const versionCode = dump.match(/\bversionCode=(\d+)/)?.[1];
  if (!versionName || !versionCode) {
    throw new Error(`Unable to read installed version for ${packageName}`);
  }
  return { versionName, versionCode };
}

/**
 * Collects the canonical device and foreground-app metadata shared by the
 * command-line and Playground Android audit reports.
 */
export async function collectAndroidAuditEnvironment(
  adb: ADB,
  options: CollectAndroidAuditEnvironmentOptions,
): Promise<AndroidAuditEnvironment> {
  const [manufacturer, model, androidVersion, apiLevel, wmSize, focused] =
    await Promise.all([
      requiredShellValue(
        adb,
        'getprop ro.product.manufacturer',
        'manufacturer',
      ),
      requiredShellValue(adb, 'getprop ro.product.model', 'model'),
      requiredShellValue(
        adb,
        'getprop ro.build.version.release',
        'Android version',
      ),
      requiredShellValue(
        adb,
        'getprop ro.build.version.sdk',
        'Android API level',
      ),
      adb.shell('wm size'),
      getFocusedApp(adb),
    ]);
  if (options.expectedPackage && focused.package !== options.expectedPackage) {
    throw new Error(
      `Focused package ${focused.package} does not match requested app ${options.expectedPackage}`,
    );
  }
  const [densityValue, appVersion, rotation] = await Promise.all([
    adb.getScreenDensity(),
    getAppVersion(adb, focused.package),
    options.rotation === undefined
      ? getRotation(adb)
      : Promise.resolve(options.rotation),
  ]);
  const density = densityValue ?? 160;
  const dpr = density / 160;
  const physical = parseWmDimension(wmSize, 'Physical') ??
    parseWmDimension(wmSize, 'Override') ?? { ...options.screenshotSize };
  const override = parseWmDimension(wmSize, 'Override');

  return {
    device: {
      serial: options.deviceId,
      manufacturer,
      model,
      androidVersion,
      apiLevel,
      resolution: {
        physical,
        ...(override ? { override } : {}),
        logical: options.logicalSize ?? {
          width: options.screenshotSize.width / dpr,
          height: options.screenshotSize.height / dpr,
        },
        screenshot: options.screenshotSize,
      },
      density,
      dpr,
      rotation,
    },
    app: {
      expectedPackage: options.expectedPackage ?? focused.package,
      package: focused.package,
      activity: focused.activity,
      ...appVersion,
    },
  };
}
