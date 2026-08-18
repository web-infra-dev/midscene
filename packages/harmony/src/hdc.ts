import { execFile } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execFileAsync = promisify(execFile);
const debugHdc = getDebug('harmony:hdc');
const supportedStringKeyEvents = new Set(['Back', 'Home', 'Power']);
const numericKeyEventPattern = /^\d+$/;
const uiInputErrorPattern =
  /(?:(?:Invalid parameters|Missing parameter|Too many parameters)\.?|Please confirm that the coordinate values are correct\.?)/i;
const minUiInputSpeed = 200;
const maxUiInputSpeed = 40000;

type UiInputOperation =
  | 'click'
  | 'doubleClick'
  | 'longClick'
  | 'swipe'
  | 'fling'
  | 'drag'
  | 'inputText'
  | 'keyEvent'
  | 'clearTextField';
type PointerMovementOperation = 'swipe' | 'fling' | 'drag';

function roundUiCoordinate(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `HDC ${name} coordinate must be a non-negative finite number`,
    );
  }
  return Math.round(value);
}

function roundUiInputSpeed(
  value: number,
  operation: PointerMovementOperation,
): number {
  if (
    !Number.isFinite(value) ||
    value < minUiInputSpeed ||
    value > maxUiInputSpeed
  ) {
    throw new Error(
      `HDC ${operation} speed must be a finite number between ${minUiInputSpeed} and ${maxUiInputSpeed}`,
    );
  }
  return Math.round(value);
}

export interface HdcOptions {
  hdcPath?: string;
  deviceId?: string;
  timeout?: number;
}

interface HarmonyAbilityTarget {
  readonly abilityName: string;
  readonly moduleName: string;
}

interface BundleAbilityInfo {
  name?: string;
  skills?: Array<{
    actions?: string[];
    entities?: string[];
  }>;
}

interface BundleModuleInfo {
  abilityInfos?: BundleAbilityInfo[];
  extensionInfos?: Array<{ name?: string }>;
  mainAbility?: string;
  mainElementName?: string;
  moduleName?: string;
  moduleType?: number | string;
  name?: string;
}

interface BundleInfo {
  entryModuleName?: string;
  hapModuleInfos?: BundleModuleInfo[];
  mainEntry?: string;
}

function parseBundleInfo(output: string, bundleName: string): BundleInfo {
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`Cannot parse bundle information for ${bundleName}`);
  }

  try {
    return JSON.parse(output.slice(jsonStart)) as BundleInfo;
  } catch (error) {
    throw new Error(`Cannot parse bundle information for ${bundleName}`, {
      cause: error,
    });
  }
}

function isLauncherAbility(ability: BundleAbilityInfo): boolean {
  return Boolean(
    ability.skills?.some(
      (skill) =>
        skill.entities?.includes('entity.system.home') &&
        skill.actions?.some(
          (action) =>
            action === 'action.system.home' ||
            action === 'ohos.want.action.home',
        ),
    ),
  );
}

function resolveModuleName(module: BundleModuleInfo): string | undefined {
  return [module.moduleName, module.name].find((name): name is string =>
    Boolean(name),
  );
}

function componentNamesMatch(left: string, right: string): boolean {
  return (
    left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
  );
}

function declaredTargetFromModule(
  module: BundleModuleInfo,
): HarmonyAbilityTarget | undefined {
  const moduleName = resolveModuleName(module);
  if (!moduleName) return undefined;

  const abilities = module.abilityInfos ?? [];
  const declaredAbilityName = [module.mainElementName, module.mainAbility].find(
    (name): name is string => Boolean(name),
  );

  if (declaredAbilityName) {
    const matchedAbility = abilities.find(
      (ability) =>
        ability.name && componentNamesMatch(ability.name, declaredAbilityName),
    );
    const isDeclaredExtension = module.extensionInfos?.some(
      (extension) =>
        extension.name &&
        componentNamesMatch(extension.name, declaredAbilityName),
    );
    if (!matchedAbility && (abilities.length > 0 || isDeclaredExtension)) {
      return undefined;
    }
    return {
      abilityName: matchedAbility?.name ?? declaredAbilityName,
      moduleName,
    };
  }

  return undefined;
}

function launcherTargetFromModule(
  module: BundleModuleInfo,
): HarmonyAbilityTarget | undefined {
  const moduleName = resolveModuleName(module);
  if (!moduleName) return undefined;

  const launcherAbility = module.abilityInfos?.find(isLauncherAbility);
  return launcherAbility?.name
    ? { abilityName: launcherAbility.name, moduleName }
    : undefined;
}

function resolveHdcPath(hdcPath?: string): string {
  if (hdcPath) return hdcPath;

  if (process.env.HDC_HOME) {
    const envPath = `${process.env.HDC_HOME}/hdc`;
    debugHdc(`Using HDC from HDC_HOME: ${envPath}`);
    return envPath;
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const commonPaths = [
    `${homeDir}/Library/HarmonyOS/next/command-line-tools/sdk/default/openharmony/toolchains/hdc`,
    `${homeDir}/Library/HarmonyOS/sdk/hmscore/3.1.0/toolchains/hdc`,
  ];
  for (const p of commonPaths) {
    try {
      accessSync(p, fsConstants.X_OK);
      debugHdc(`Found HDC at: ${p}`);
      return p;
    } catch {}
  }

  return 'hdc';
}

export class HdcClient {
  private hdcPath: string;
  private deviceId: string;
  private timeout: number;
  private execMutex: Promise<void> = Promise.resolve();
  private launchAbilityCache = new Map<string, HarmonyAbilityTarget>();

  constructor(options: HdcOptions) {
    this.hdcPath = resolveHdcPath(options.hdcPath);
    this.deviceId = options.deviceId ?? '';
    this.timeout = options.timeout ?? 60000;
  }

  private buildArgs(args: string[]): string[] {
    if (this.deviceId) {
      return ['-t', this.deviceId, ...args];
    }
    return args;
  }

  async exec(...args: string[]): Promise<string> {
    // Serialize all hdc commands to prevent concurrent processes from
    // competing for the device connection (causes timeouts on Windows).
    let release: () => void;
    const prev = this.execMutex;
    this.execMutex = new Promise<void>((r) => {
      release = r;
    });
    await prev;

    const fullArgs = this.buildArgs(args);
    debugHdc(`hdc ${fullArgs.join(' ')}`);

    try {
      const { stdout, stderr } = await execFileAsync(this.hdcPath, fullArgs, {
        timeout: this.timeout,
        maxBuffer: 50 * 1024 * 1024,
      });

      if (stderr?.trim()) {
        debugHdc(`hdc stderr: ${stderr.trim()}`);
      }

      debugHdc(`hdc ${fullArgs.join(' ')} end`);
      return stdout;
    } catch (error: any) {
      // On Windows, hdc shell may hang after command completion, causing
      // Node to kill it via SIGTERM. If stdout contains valid output, treat
      // it as success instead of throwing.
      if (error.killed && error.stdout?.trim()) {
        debugHdc(
          'hdc process was killed but stdout is available, treating as success',
        );
        return error.stdout;
      }
      debugHdc(`hdc error: ${error.message}`);
      throw new Error(
        `HDC command failed: hdc ${fullArgs.join(' ')}: ${error.message}`,
        { cause: error },
      );
    } finally {
      release!();
    }
  }

  async shell(command: string): Promise<string> {
    return this.exec('shell', command);
  }

  private assertUiInputSucceeded(
    operation: UiInputOperation,
    output: string,
    detail?: string,
  ): void {
    const errorMatch = output.match(uiInputErrorPattern);
    if (!errorMatch) return;

    const detailText = detail ? ` for ${detail}` : '';
    throw new Error(
      `HDC uiInput ${operation} failed${detailText}: ${errorMatch[0]}`,
    );
  }

  private async runUiInput(
    operation: Exclude<UiInputOperation, 'clearTextField'>,
    args: string,
    detail?: string,
  ): Promise<void> {
    const output = await this.shell(`uitest uiInput ${operation} ${args}`);
    this.assertUiInputSucceeded(operation, output, detail);
  }

  private buildPointerMovementArgs(
    operation: PointerMovementOperation,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): string {
    const args = [
      roundUiCoordinate(fromX, 'fromX'),
      roundUiCoordinate(fromY, 'fromY'),
      roundUiCoordinate(toX, 'toX'),
      roundUiCoordinate(toY, 'toY'),
    ];
    if (speed !== undefined) {
      args.push(roundUiInputSpeed(speed, operation));
    }
    return args.join(' ');
  }

  async fileSend(localPath: string, remotePath: string): Promise<void> {
    await this.exec('file', 'send', localPath, remotePath);
  }

  async fileRecv(remotePath: string, localPath: string): Promise<void> {
    await this.exec('file', 'recv', remotePath, localPath);
  }

  async screenshot(remotePath: string): Promise<string> {
    return await this.shell(`snapshot_display -f ${remotePath}`);
  }

  async click(x: number, y: number): Promise<void> {
    await this.runUiInput(
      'click',
      `${roundUiCoordinate(x, 'x')} ${roundUiCoordinate(y, 'y')}`,
    );
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.runUiInput(
      'doubleClick',
      `${roundUiCoordinate(x, 'x')} ${roundUiCoordinate(y, 'y')}`,
    );
  }

  async longClick(x: number, y: number): Promise<void> {
    await this.runUiInput(
      'longClick',
      `${roundUiCoordinate(x, 'x')} ${roundUiCoordinate(y, 'y')}`,
    );
  }

  async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): Promise<void> {
    await this.runUiInput(
      'swipe',
      this.buildPointerMovementArgs('swipe', fromX, fromY, toX, toY, speed),
    );
  }

  async fling(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): Promise<void> {
    await this.runUiInput(
      'fling',
      this.buildPointerMovementArgs('fling', fromX, fromY, toX, toY, speed),
    );
  }

  async drag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): Promise<void> {
    await this.runUiInput(
      'drag',
      this.buildPointerMovementArgs('drag', fromX, fromY, toX, toY, speed),
    );
  }

  async inputText(x: number, y: number, text: string): Promise<void> {
    const escapedText = text.replace(/'/g, "'\\''");
    await this.runUiInput(
      'inputText',
      `${roundUiCoordinate(x, 'x')} ${roundUiCoordinate(y, 'y')} '${escapedText}'`,
    );
  }

  async keyEvent(...keys: string[]): Promise<void> {
    if (keys.length < 1 || keys.length > 3) {
      throw new Error('HDC keyEvent requires between 1 and 3 keys');
    }

    if (
      keys.length > 1 &&
      keys.some((key) => supportedStringKeyEvents.has(key))
    ) {
      throw new Error('HDC system key events cannot be combined');
    }

    for (const key of keys) {
      if (
        !supportedStringKeyEvents.has(key) &&
        !numericKeyEventPattern.test(key)
      ) {
        throw new Error(`Invalid HDC key event: ${key}`);
      }
    }

    const joinedKeys = keys.join(' ');
    await this.runUiInput('keyEvent', joinedKeys, joinedKeys);
  }

  /** Select all text in the focused field with Ctrl+A, then delete it. */
  async clearTextField(): Promise<void> {
    const output = await this.shell(
      'uitest uiInput keyEvent 2072 2017;uitest uiInput keyEvent 2055',
    );
    this.assertUiInputSucceeded('clearTextField', output);
  }

  async startAbility(
    bundleName: string,
    abilityName: string,
    moduleName?: string,
  ): Promise<void> {
    const moduleArg = moduleName ? ` -m ${moduleName}` : '';
    const output = await this.shell(
      `aa start -a ${abilityName} -b ${bundleName}${moduleArg}`,
    );
    if (output.includes('error:')) {
      throw new Error(
        `Failed to start ${bundleName}/${abilityName}: ${output.trim()}`,
      );
    }
  }

  private async queryLaunchAbility(
    bundleName: string,
  ): Promise<HarmonyAbilityTarget> {
    const output = await this.shell(`bm dump -n ${bundleName}`);
    const bundleInfo = parseBundleInfo(output, bundleName);
    const modules = bundleInfo.hapModuleInfos ?? [];
    const entryModuleNames = new Set(
      [bundleInfo.entryModuleName, bundleInfo.mainEntry].filter(
        (name): name is string => Boolean(name),
      ),
    );
    const preferredModules = modules.filter(
      (module) =>
        entryModuleNames.has(module.moduleName ?? '') ||
        entryModuleNames.has(module.name ?? ''),
    );
    const entryModules = modules.filter(
      (module) =>
        !preferredModules.includes(module) &&
        (module.moduleType === 1 || module.moduleType === 'entry'),
    );
    const remainingModules = modules.filter(
      (module) =>
        !preferredModules.includes(module) && !entryModules.includes(module),
    );

    const entryModulesByPriority = [...preferredModules, ...entryModules];
    for (const module of entryModulesByPriority) {
      const target = declaredTargetFromModule(module);
      if (target) return target;
    }

    for (const module of entryModulesByPriority) {
      const target = launcherTargetFromModule(module);
      if (target) return target;
    }

    for (const module of remainingModules) {
      const target = launcherTargetFromModule(module);
      if (target) return target;
    }

    for (const module of remainingModules) {
      const target = declaredTargetFromModule(module);
      if (target) return target;
    }

    throw new Error(`Cannot find a launchable ability for ${bundleName}`);
  }

  /**
   * Launch an app by bundle name using its system-declared entry ability.
   * Successful resolutions are cached for this HDC connection. If a cached
   * target becomes stale, it is queried again and retried only when it changed.
   */
  async launchBundle(bundleName: string): Promise<void> {
    const cachedTarget = this.launchAbilityCache.get(bundleName);
    const target = cachedTarget ?? (await this.queryLaunchAbility(bundleName));

    try {
      await this.startAbility(
        bundleName,
        target.abilityName,
        target.moduleName,
      );
      this.launchAbilityCache.set(bundleName, target);
    } catch (error) {
      this.launchAbilityCache.delete(bundleName);
      if (!cachedTarget) throw error;

      const refreshedTarget = await this.queryLaunchAbility(bundleName);
      if (
        refreshedTarget.abilityName === cachedTarget.abilityName &&
        refreshedTarget.moduleName === cachedTarget.moduleName
      ) {
        throw error;
      }

      debugHdc(
        `Cached launch ability changed from ${cachedTarget.moduleName}/${cachedTarget.abilityName} to ${refreshedTarget.moduleName}/${refreshedTarget.abilityName}`,
      );
      await this.startAbility(
        bundleName,
        refreshedTarget.abilityName,
        refreshedTarget.moduleName,
      );
      this.launchAbilityCache.set(bundleName, refreshedTarget);
    }
  }

  async forceStop(bundleName: string): Promise<void> {
    const output = await this.shell(`aa force-stop ${bundleName}`);
    if (output.includes('error:')) {
      throw new Error(`Failed to force stop ${bundleName}: ${output.trim()}`);
    }
  }

  async getScreenInfo(): Promise<{ width: number; height: number }> {
    const stdout = await this.shell('hidumper -s RenderService -a screen');
    const renderDimensionPattern =
      'render\\s+(?:size|resolution)\\s*[:=]\\s*(\\d{3,5})x(\\d{3,5})';

    // For foldable screens, find which screen is currently powered on
    // via the foldScreenId section, then match its render size.
    const activeFoldMatch = stdout.match(
      /foldScreenId:(\d+),\s*isConnected:\d+,\s*isPowerOn:1/,
    );
    if (activeFoldMatch) {
      const activeId = activeFoldMatch[1];
      const screenRegex = new RegExp(
        `screen\\[\\d+\\]:\\s*id=${activeId},.*?${renderDimensionPattern}`,
      );
      const screenMatch = stdout.match(screenRegex);
      if (screenMatch) {
        debugHdc(
          `Foldable screen detected, active screen id=${activeId}: ${screenMatch[1]}x${screenMatch[2]}`,
        );
        return {
          width: Number.parseInt(screenMatch[1], 10),
          height: Number.parseInt(screenMatch[2], 10),
        };
      }
    }

    // Non-foldable: use the first render size/resolution like "1260x2720"
    const renderSizeMatch = stdout.match(new RegExp(renderDimensionPattern));
    if (renderSizeMatch) {
      return {
        width: Number.parseInt(renderSizeMatch[1], 10),
        height: Number.parseInt(renderSizeMatch[2], 10),
      };
    }

    // Fallback: try hidumper DisplayManagerService
    const displayStdout = await this.shell(
      'hidumper -s DisplayManagerService -a',
    );
    const displayMatch = displayStdout.match(
      /activeModes.*?(\d{3,5}),\s*(\d{3,5})/,
    );
    if (displayMatch) {
      return {
        width: Number.parseInt(displayMatch[1], 10),
        height: Number.parseInt(displayMatch[2], 10),
      };
    }

    throw new Error(
      `Failed to get screen size from HDC. RenderService output: ${stdout}`,
    );
  }

  async listTargets(): Promise<string[]> {
    const stdout = await this.exec('list', 'targets');
    return stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('['));
  }
}
