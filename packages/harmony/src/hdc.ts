import { execFile } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execFileAsync = promisify(execFile);
const debugHdc = getDebug('harmony:hdc');

export interface HdcOptions {
  hdcPath?: string;
  deviceId?: string;
  timeout?: number;
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
    await this.shell(`uitest uiInput click ${Math.round(x)} ${Math.round(y)}`);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.shell(
      `uitest uiInput doubleClick ${Math.round(x)} ${Math.round(y)}`,
    );
  }

  async longClick(x: number, y: number): Promise<void> {
    await this.shell(
      `uitest uiInput longClick ${Math.round(x)} ${Math.round(y)}`,
    );
  }

  async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): Promise<void> {
    const args = [
      Math.round(fromX),
      Math.round(fromY),
      Math.round(toX),
      Math.round(toY),
    ];
    if (speed !== undefined) {
      args.push(Math.round(speed));
    }
    await this.shell(`uitest uiInput swipe ${args.join(' ')}`);
  }

  async fling(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): Promise<void> {
    const args = [
      Math.round(fromX),
      Math.round(fromY),
      Math.round(toX),
      Math.round(toY),
    ];
    if (speed !== undefined) {
      args.push(Math.round(speed));
    }
    await this.shell(`uitest uiInput fling ${args.join(' ')}`);
  }

  async drag(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    speed?: number,
  ): Promise<void> {
    const args = [
      Math.round(fromX),
      Math.round(fromY),
      Math.round(toX),
      Math.round(toY),
    ];
    if (speed !== undefined) {
      args.push(Math.round(speed));
    }
    await this.shell(`uitest uiInput drag ${args.join(' ')}`);
  }

  async inputText(x: number, y: number, text: string): Promise<void> {
    const escapedText = text.replace(/'/g, "'\\''");
    await this.shell(
      `uitest uiInput inputText ${Math.round(x)} ${Math.round(y)} '${escapedText}'`,
    );
  }

  async keyEvent(...keys: string[]): Promise<void> {
    await this.shell(`uitest uiInput keyEvent ${keys.join(' ')}`);
  }

  /**
   * Clear text field by batch-sending Backspace(2055) and Delete(2071) key
   * events. Deletes both before and after the cursor to ensure all content is
   * removed regardless of cursor position, matching Android's clearTextField.
   */
  async clearTextField(length = 100): Promise<void> {
    const keys: string[] = [];
    for (let i = 0; i < length; i++) {
      keys.push('2055', '2071'); // Backspace + Delete
    }
    await this.keyEvent(...keys);
  }

  async startAbility(bundleName: string, abilityName: string): Promise<void> {
    const output = await this.shell(
      `aa start -a ${abilityName} -b ${bundleName}`,
    );
    if (output.includes('error:')) {
      throw new Error(
        `Failed to start ${bundleName}/${abilityName}: ${output.trim()}`,
      );
    }
  }

  async queryMainAbility(bundleName: string): Promise<string | undefined> {
    const output = await this.shell(`bm dump -n ${bundleName}`);
    const names: string[] = [];
    for (const match of output.matchAll(/"name"\s*:\s*"([^"]+)"/g)) {
      names.push(match[1]);
    }
    // Prefer: EntryAbility > MainAbility > {bundleName}.MainAbility > first *Ability
    for (const candidate of [
      'EntryAbility',
      'MainAbility',
      `${bundleName}.MainAbility`,
    ]) {
      if (names.includes(candidate)) return candidate;
    }
    // Fallback: find first ability-like name that isn't the bundle itself
    return names.find(
      (n) =>
        n !== bundleName &&
        n.endsWith('Ability') &&
        !n.includes('Extension') &&
        !n.includes('Service') &&
        !n.includes('Form') &&
        !n.includes('Dialog'),
    );
  }

  async forceStop(bundleName: string): Promise<void> {
    await this.shell(`aa force-stop ${bundleName}`);
  }

  async getScreenInfo(): Promise<{ width: number; height: number }> {
    const stdout = await this.shell('hidumper -s RenderService -a screen');

    // For foldable screens, find which screen is currently powered on
    // via the foldScreenId section, then match its render size.
    const activeFoldMatch = stdout.match(
      /foldScreenId:(\d+),\s*isConnected:\d+,\s*isPowerOn:1/,
    );
    if (activeFoldMatch) {
      const activeId = activeFoldMatch[1];
      const screenRegex = new RegExp(
        `screen\\[\\d+\\]:\\s*id=${activeId},.*?render size:\\s*(\\d{3,5})x(\\d{3,5})`,
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

    // Non-foldable: use the first render size like "1260x2720"
    const renderSizeMatch = stdout.match(/render size:\s*(\d{3,5})x(\d{3,5})/);
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
