import { execFile } from 'node:child_process';
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
      require('node:fs').accessSync(p, require('node:fs').constants.X_OK);
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

  constructor(options: HdcOptions) {
    this.hdcPath = resolveHdcPath(options.hdcPath);
    this.deviceId = options.deviceId || '';
    this.timeout = options.timeout || 60000;
  }

  private buildArgs(args: string[]): string[] {
    if (this.deviceId) {
      return ['-t', this.deviceId, ...args];
    }
    return args;
  }

  async exec(...args: string[]): Promise<string> {
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
      debugHdc(`hdc error: ${error.message}`);
      throw new Error(
        `HDC command failed: hdc ${fullArgs.join(' ')}: ${error.message}`,
        { cause: error },
      );
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

  async screenshot(remotePath: string): Promise<void> {
    await this.shell(`snapshot_display -f ${remotePath}`);
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

  async startAbility(bundleName: string, abilityName: string): Promise<void> {
    await this.shell(`aa start -a ${abilityName} -b ${bundleName}`);
  }

  async forceStop(bundleName: string): Promise<void> {
    await this.shell(`aa force-stop ${bundleName}`);
  }

  async getScreenInfo(): Promise<{ width: number; height: number }> {
    const stdout = await this.shell('hidumper -s RenderService -a screen');

    // Try to parse render size like "1260x2720"
    const renderSizeMatch = stdout.match(/(\d{3,5})\s*x\s*(\d{3,5})/);
    if (renderSizeMatch) {
      return {
        width: Number.parseInt(renderSizeMatch[1], 10),
        height: Number.parseInt(renderSizeMatch[2], 10),
      };
    }

    // Fallback: try hidumper DisplayManagerService
    const displayStdout = await this.shell(
      'hidumper -s DisplayManagerService -a -a',
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
