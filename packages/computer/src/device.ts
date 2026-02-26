import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  type DeviceAction,
  type InterfaceType,
  type LocateResultElement,
  type Size,
  getMidsceneLocationSchema,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionHoverParam,
  type ActionTapParam,
  actionHoverParamSchema,
  defineAction,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import {
  createImgBase64ByFormat,
  imageInfoOfBase64,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import screenshot from 'screenshot-desktop';
import type { XvfbInstance } from './xvfb';
import { checkXvfbInstalled, needsXvfb, startXvfb } from './xvfb';

// Type definitions
interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LibNut {
  getScreenSize(): { width: number; height: number };
  getMousePos(): { x: number; y: number };
  moveMouse(x: number, y: number): void;
  mouseClick(button?: 'left' | 'right' | 'middle', double?: boolean): void;
  mouseToggle(state: 'up' | 'down', button?: 'left' | 'right' | 'middle'): void;
  scrollMouse(x: number, y: number): void;
  keyTap(key: string, modifiers?: string[]): void;
  typeString(text: string): void;
  // Window management
  getWindows(): number[];
  getActiveWindow(): number;
  getWindowRect(handle: number): WindowRect;
  getWindowTitle(handle: number): string;
  focusWindow(handle: number): void;
}

interface ScreenshotOptions {
  format: 'png' | 'jpg';
  screen?: string | number;
}

interface ScreenshotDisplay {
  id: string | number;
  name?: string;
  primary?: boolean;
}

// Constants
const SMOOTH_MOVE_STEPS_MOUSE_MOVE = 10;
const SMOOTH_MOVE_DELAY_MOUSE_MOVE = 10;
const MOUSE_MOVE_EFFECT_WAIT = 300;
const INPUT_FOCUS_DELAY = 300;
const INPUT_CLEAR_DELAY = 150;
const SCROLL_REPEAT_COUNT = 10;
const SCROLL_STEP_DELAY = 100;
const SCROLL_COMPLETE_DELAY = 500;

// macOS AppleScript key code mapping
// Reference: https://eastmanreference.com/complete-list-of-applescript-key-codes
const APPLESCRIPT_KEY_CODE_MAP: Record<string, number> = {
  // Special keys
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  backspace: 51,
  delete: 51,
  escape: 53,
  forwarddelete: 117,

  // Arrow keys
  left: 123,
  right: 124,
  down: 125,
  up: 126,

  // Navigation keys
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,

  // Function keys
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

// Modifier key mapping for AppleScript
const APPLESCRIPT_MODIFIER_MAP: Record<string, string> = {
  command: 'command down',
  cmd: 'command down',
  control: 'control down',
  ctrl: 'control down',
  shift: 'shift down',
  alt: 'option down',
  option: 'option down',
  meta: 'command down',
};

/**
 * Send a key press using AppleScript (macOS only)
 * More reliable than libnut for TUI applications like Bubble Tea
 */
function sendKeyViaAppleScript(key: string, modifiers: string[] = []): void {
  const lowerKey = key.toLowerCase();
  const keyCode = APPLESCRIPT_KEY_CODE_MAP[lowerKey];

  // Build modifier string
  const modifierParts = modifiers
    .map((m) => APPLESCRIPT_MODIFIER_MAP[m.toLowerCase()])
    .filter(Boolean);
  const modifierStr =
    modifierParts.length > 0 ? ` using {${modifierParts.join(', ')}}` : '';

  let script: string;

  if (keyCode !== undefined) {
    // Use key code for special keys
    script = `tell application "System Events" to key code ${keyCode}${modifierStr}`;
  } else if (lowerKey.length === 1) {
    // Use keystroke for single characters (letters, numbers, symbols)
    script = `tell application "System Events" to keystroke "${key}"${modifierStr}`;
  } else {
    // Fallback: try as keystroke
    script = `tell application "System Events" to keystroke "${key}"${modifierStr}`;
  }

  debugDevice('sendKeyViaAppleScript', { key, modifiers, script });
  execSync(`osascript -e '${script}'`);
}

// Lazy load libnut with fallback
let libnut: LibNut | null = null;
let libnutLoadError: Error | null = null;

async function getLibnut(): Promise<LibNut> {
  if (libnut) return libnut;
  if (libnutLoadError) throw libnutLoadError;

  try {
    const require = createRequire(import.meta.url);
    const libnutModule = require('@computer-use/libnut/dist/import_libnut');
    libnut = libnutModule.libnut as LibNut;
    if (!libnut) {
      throw new Error('libnut module loaded but libnut object is undefined');
    }
    return libnut;
  } catch (error) {
    libnutLoadError = error as Error;
    throw new Error(
      `Failed to load @computer-use/libnut. Make sure it is properly installed and compiled for your platform. Error: ${error}`,
    );
  }
}

const debugDevice = getDebug('computer:device');

// Key name mapping for cross-platform compatibility
// Note: Modifier keys have different names when used as primary key vs modifier
const KEY_NAME_MAP: Record<string, string> = {
  // Modifier keys (for use in modifiers array)
  windows: 'win',
  win: 'win',
  ctrl: 'control',
  esc: 'escape',
  del: 'delete',
  ins: 'insert',
  // Navigation keys
  pgup: 'pageup',
  pgdn: 'pagedown',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  // Media keys
  volumedown: 'audio_vol_down',
  volumeup: 'audio_vol_up',
  mediavolumedown: 'audio_vol_down',
  mediavolumeup: 'audio_vol_up',
  mute: 'audio_mute',
  mediamute: 'audio_mute',
  mediaplay: 'audio_play',
  mediapause: 'audio_pause',
  mediaplaypause: 'audio_play',
  mediastop: 'audio_stop',
  medianexttrack: 'audio_next',
  mediaprevioustrack: 'audio_prev',
  medianext: 'audio_next',
  mediaprev: 'audio_prev',
};

// When pressing modifier keys alone (as primary key), use these names
// This is needed because libnut requires different key names for modifiers
// when they are the main key vs when they are in the modifiers array
const PRIMARY_KEY_MAP: Record<string, string> = {
  command: 'cmd',
  cmd: 'cmd',
  meta: 'meta',
  control: 'control',
  ctrl: 'control',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
};

function normalizeKeyName(key: string): string {
  const lowerKey = key.toLowerCase();
  return KEY_NAME_MAP[lowerKey] || lowerKey;
}

function normalizePrimaryKey(key: string): string {
  const lowerKey = key.toLowerCase();
  // First check PRIMARY_KEY_MAP for modifier keys pressed alone
  if (PRIMARY_KEY_MAP[lowerKey]) {
    return PRIMARY_KEY_MAP[lowerKey];
  }
  // Then use regular KEY_NAME_MAP
  return KEY_NAME_MAP[lowerKey] || lowerKey;
}

export interface DisplayInfo {
  id: string;
  name: string;
  primary?: boolean;
}

export interface ComputerDeviceOpt {
  displayId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customActions?: DeviceAction<any>[];
  /**
   * Keyboard driver for sending key events (macOS only)
   * - 'applescript': Use AppleScript via osascript (default on macOS, more reliable)
   * - 'libnut': Use libnut's keyTap (faster but may not work with some TUI apps)
   */
  keyboardDriver?: 'applescript' | 'libnut';
  /**
   * Headless mode via Xvfb (Linux only).
   * - true: start Xvfb virtual display
   * - false/undefined: do not start Xvfb
   * Can also be set via MIDSCENE_COMPUTER_HEADLESS_LINUX=true environment variable.
   */
  headless?: boolean;
  /**
   * Resolution for Xvfb virtual display (default '1920x1080x24')
   */
  xvfbResolution?: string;
}

export class ComputerDevice implements AbstractInterface {
  interfaceType: InterfaceType = 'computer';
  private options?: ComputerDeviceOpt;
  private displayId?: string;
  private description?: string;
  private destroyed = false;
  private xvfbInstance?: XvfbInstance;
  private xvfbCleanup?: () => void;
  /**
   * On macOS, use AppleScript for keyboard operations by default
   * to avoid focus issues with system overlays (e.g. Spotlight).
   */
  private useAppleScript: boolean;
  /**
   * DPI scale factor: screenshot physical pixels / logical screen size.
   * On Windows with 250% scaling: dpiScale = 2.5
   * Used to convert AI coordinates (physical) to logical coordinates for moveMouse.
   */
  private dpiScale = 1;
  /**
   * Mouse coordinate calibration data.
   * On high DPI Windows, moveMouse(x,y) may not move the cursor to (x,y).
   * We measure the actual transformation via 2-point calibration and invert it.
   * Transform: actual = scale * input + offset
   * Inverse: input = (target - offset) / scale
   */
  private mouseCalibrated = false;
  private mouseScaleX = 1;
  private mouseScaleY = 1;
  private mouseOffsetX = 0;
  private mouseOffsetY = 0;
  /**
   * When libnut.moveMouse is completely broken (returns same position for
   * different inputs), fall back to Win32 mouse_event via PowerShell.
   */
  private useWin32MouseFallback = false;
  uri?: string;

  constructor(options?: ComputerDeviceOpt) {
    this.options = options;
    this.displayId = options?.displayId;
    this.useAppleScript =
      process.platform === 'darwin' && options?.keyboardDriver !== 'libnut';
  }

  describe(): string {
    return this.description || 'Computer Device';
  }

  /**
   * Get all available displays
   */
  static async listDisplays(): Promise<DisplayInfo[]> {
    try {
      const displays: ScreenshotDisplay[] = await screenshot.listDisplays();
      return displays.map((d) => ({
        id: String(d.id),
        name: d.name || `Display ${d.id}`,
        primary: d.primary || false,
      }));
    } catch (error) {
      debugDevice(`Failed to list displays: ${error}`);
      return [];
    }
  }

  async connect(): Promise<void> {
    debugDevice('Connecting to computer device');

    try {
      // Start Xvfb if explicitly requested (option or env var)
      const headless =
        this.options?.headless ??
        process.env.MIDSCENE_COMPUTER_HEADLESS_LINUX === 'true';
      if (needsXvfb(headless)) {
        if (!checkXvfbInstalled()) {
          throw new Error(
            'Xvfb is required for headless mode but not installed. Install: sudo apt-get install xvfb',
          );
        }
        this.xvfbInstance = await startXvfb({
          resolution: this.options?.xvfbResolution,
        });
        process.env.DISPLAY = this.xvfbInstance.display;
        debugDevice(`Xvfb started on display ${this.xvfbInstance.display}`);

        // Clean up Xvfb on process exit (stored for removal in destroy())
        this.xvfbCleanup = () => {
          if (this.xvfbInstance) {
            this.xvfbInstance.stop();
            this.xvfbInstance = undefined;
          }
        };
        process.on('exit', this.xvfbCleanup);
        process.on('SIGINT', this.xvfbCleanup);
        process.on('SIGTERM', this.xvfbCleanup);
      }

      // Load libnut on first connect
      libnut = await getLibnut();

      const size = await this.size();
      const displays = await ComputerDevice.listDisplays();

      const headlessInfo = this.xvfbInstance
        ? `\nHeadless: true (Xvfb on ${this.xvfbInstance.display})`
        : '';

      // Detect DPI scaling: compare screenshot physical size with logical screen size
      let dpiInfo = '';
      try {
        const screenshotB64 = await this.screenshotBase64();
        const imgInfo = await imageInfoOfBase64(screenshotB64);
        const scaleX = imgInfo.width / size.width;
        const scaleY = imgInfo.height / size.height;
        this.dpiScale = Math.max(scaleX, scaleY);
        dpiInfo = `\nScreenshot Size: ${imgInfo.width}x${imgInfo.height} (dpiScale: ${this.dpiScale.toFixed(2)})`;
        if (this.dpiScale !== 1) {
          debugDevice(
            `DPI scaling detected: ${this.dpiScale.toFixed(2)}x. Mouse coordinates will be auto-corrected (physical / ${this.dpiScale.toFixed(2)} = logical).`,
          );
        }
      } catch (e) {
        dpiInfo = '\nScreenshot Size: unknown (check failed)';
      }

      this.description = `
Type: Computer
Platform: ${process.platform}
Display: ${this.displayId || 'Primary'}
Screen Size: ${size.width}x${size.height}${dpiInfo}
Available Displays: ${displays.length > 0 ? displays.map((d) => d.name).join(', ') : 'Unknown'}${headlessInfo}
`;
      debugDevice('Computer device connected', this.description);
      // Health check: verify screenshot and mouse control are working
      await this.healthCheck();

      // Calibrate mouse coordinates on high-DPI machines
      if (this.dpiScale > 1) {
        await this.calibrateMouse();
      }
    } catch (error) {
      // Clean up Xvfb on connection failure
      if (this.xvfbInstance) {
        this.xvfbInstance.stop();
        this.xvfbInstance = undefined;
      }
      debugDevice(`Failed to connect: ${error}`);
      throw new Error(`Unable to connect to computer device: ${error}`);
    }
  }

  private async healthCheck(): Promise<void> {
    console.log('[HealthCheck] Starting health check...');

    // Step 1: Take a screenshot (with timeout to handle screenshot-desktop
    // hanging when xrandr is missing on Linux — its promise never settles)
    console.log('[HealthCheck] Taking screenshot...');
    const screenshotTimeout = 15_000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Screenshot timed out')),
        screenshotTimeout,
      );
    });
    const base64 = await Promise.race([
      this.screenshotBase64().finally(() => clearTimeout(timeoutId)),
      timeoutPromise,
    ]);
    console.log(`[HealthCheck] Screenshot succeeded (length=${base64.length})`);

    // Step 2: Move the mouse
    console.log('[HealthCheck] Moving mouse...');
    assert(libnut, 'libnut not initialized');
    const startPos = libnut.getMousePos();
    console.log(
      `[HealthCheck] Current mouse position: (${startPos.x}, ${startPos.y})`,
    );

    // Move the mouse by a small random offset, then move it back
    const offsetX = Math.floor(Math.random() * 40) + 10;
    const offsetY = Math.floor(Math.random() * 40) + 10;
    const targetX = startPos.x + offsetX;
    const targetY = startPos.y + offsetY;

    console.log(`[HealthCheck] Moving mouse to (${targetX}, ${targetY})...`);
    libnut.moveMouse(targetX, targetY);
    await sleep(50);

    const movedPos = libnut.getMousePos();
    console.log(
      `[HealthCheck] Mouse position after move: (${movedPos.x}, ${movedPos.y})`,
    );

    // Restore original position
    libnut.moveMouse(startPos.x, startPos.y);
    console.log(
      `[HealthCheck] Mouse restored to (${startPos.x}, ${startPos.y})`,
    );

    console.log('[HealthCheck] Health check passed');
  }

  /**
   * Calibrate mouse coordinates by measuring the actual transformation.
   * Strategy:
   * 1. Try 2-point calibration with logical coordinates
   * 2. If moveMouse doesn't work (scale=0), retry with DPI-multiplied coordinates
   * 3. If still broken, fall back to Win32 mouse_event via PowerShell (Windows only)
   */
  private async calibrateMouse(): Promise<void> {
    assert(libnut, 'libnut not initialized');

    const savedPos = libnut.getMousePos();

    // Pass 1: try with logical coordinates
    const result = await this.tryCalibrationPass(
      { x: 100, y: 100 },
      { x: 300, y: 300 },
      'logical',
    );
    if (result) {
      this.applyCalibration(result, savedPos);
      return;
    }

    // Pass 2: try with DPI-multiplied coordinates (physical space)
    // On some high-DPI Windows setups, moveMouse expects physical coordinates
    const dpi = this.dpiScale;
    const result2 = await this.tryCalibrationPass(
      { x: Math.round(100 * dpi), y: Math.round(100 * dpi) },
      { x: Math.round(300 * dpi), y: Math.round(300 * dpi) },
      'DPI-multiplied',
    );
    if (result2) {
      this.applyCalibration(result2, savedPos);
      return;
    }

    // Pass 3: on Windows, try mouse_event with MOUSEEVENTF_ABSOLUTE as fallback
    if (process.platform === 'win32') {
      const win32Works = await this.testWin32MouseFallback();
      if (win32Works) {
        this.useWin32MouseFallback = true;
        debugDevice(
          'Using Win32 mouse_event (MOUSEEVENTF_ABSOLUTE) fallback for cursor positioning',
        );
        return;
      }
    }

    debugDevice(
      'All mouse calibration methods failed. Mouse positioning may be inaccurate on this machine.',
    );
  }

  private async tryCalibrationPass(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    label: string,
  ): Promise<{
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    a1: { x: number; y: number };
    a2: { x: number; y: number };
  } | null> {
    assert(libnut, 'libnut not initialized');

    libnut.moveMouse(p1.x, p1.y);
    await sleep(80);
    const a1 = libnut.getMousePos();

    libnut.moveMouse(p2.x, p2.y);
    await sleep(80);
    const a2 = libnut.getMousePos();

    const dax = a2.x - a1.x;
    const day = a2.y - a1.y;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const scaleX = dax / dx;
    const scaleY = day / dy;

    debugDevice(
      `Calibration pass (${label}): moveMouse(${p1.x},${p1.y})->actual(${a1.x},${a1.y}), moveMouse(${p2.x},${p2.y})->actual(${a2.x},${a2.y}), scale=(${scaleX.toFixed(3)},${scaleY.toFixed(3)})`,
    );

    if (
      scaleX === 0 ||
      scaleY === 0 ||
      !Number.isFinite(scaleX) ||
      !Number.isFinite(scaleY)
    ) {
      return null;
    }

    const offsetX = a1.x - scaleX * p1.x;
    const offsetY = a1.y - scaleY * p1.y;

    // Check if correction is actually needed
    if (
      Math.abs(scaleX - 1) <= 0.01 &&
      Math.abs(scaleY - 1) <= 0.01 &&
      Math.abs(offsetX) <= 3 &&
      Math.abs(offsetY) <= 3
    ) {
      debugDevice('Mouse coordinates are accurate, no correction needed');
    }

    return { scaleX, scaleY, offsetX, offsetY, p1, p2, a1, a2 };
  }

  private applyCalibration(
    cal: {
      scaleX: number;
      scaleY: number;
      offsetX: number;
      offsetY: number;
    },
    savedPos: { x: number; y: number },
  ): void {
    this.mouseScaleX = cal.scaleX;
    this.mouseScaleY = cal.scaleY;
    this.mouseOffsetX = cal.offsetX;
    this.mouseOffsetY = cal.offsetY;
    this.mouseCalibrated = true;

    debugDevice(
      `Mouse calibration applied: actualX = ${cal.scaleX.toFixed(4)} * inputX + ${cal.offsetX.toFixed(1)}, actualY = ${cal.scaleY.toFixed(4)} * inputY + ${cal.offsetY.toFixed(1)}`,
    );

    // Restore position using corrected coordinates
    if (libnut) {
      const restoreX = Math.round(
        (savedPos.x - this.mouseOffsetX) / this.mouseScaleX,
      );
      const restoreY = Math.round(
        (savedPos.y - this.mouseOffsetY) / this.mouseScaleY,
      );
      libnut.moveMouse(restoreX, restoreY);
    }
  }

  /**
   * Test multiple Win32 cursor APIs to find one that works.
   * Tries: SendInput, DPI-aware SetCursorPos, mouse_event.
   */
  private async testWin32MouseFallback(): Promise<boolean> {
    assert(libnut, 'libnut not initialized');
    const screenSize = libnut.getScreenSize();

    // Try each method and see if any can actually move the cursor
    const methods = ['SendInput', 'DpiAwareSetCursorPos', 'mouse_event'];
    for (const method of methods) {
      try {
        const t1 = { x: 200, y: 200 };
        const t2 = { x: 500, y: 500 };

        this.win32MouseMove(t1.x, t1.y, screenSize, method);
        await sleep(150);
        const a1 = libnut.getMousePos();

        this.win32MouseMove(t2.x, t2.y, screenSize, method);
        await sleep(150);
        const a2 = libnut.getMousePos();

        const moved = a1.x !== a2.x || a1.y !== a2.y;
        debugDevice(
          `Win32 fallback [${method}]: move(${t1.x},${t1.y})->actual(${a1.x},${a1.y}), move(${t2.x},${t2.y})->actual(${a2.x},${a2.y}), worked=${moved}`,
        );

        if (moved) {
          this.win32MouseMethod = method;
          return true;
        }
      } catch (e) {
        debugDevice(`Win32 fallback [${method}] failed: ${e}`);
      }
    }
    return false;
  }

  /**
   * The Win32 API method that was found to work during testing.
   */
  private win32MouseMethod = 'SendInput';

  /**
   * Build and execute a PowerShell script via -EncodedCommand.
   */
  private runPowerShell(script: string): void {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execSync(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: 10000, windowsHide: true, stdio: 'pipe' },
    );
  }

  /**
   * Move cursor via Win32 API using the specified method.
   * Uses PowerShell -EncodedCommand to avoid escaping issues.
   */
  private win32MouseMove(
    x: number,
    y: number,
    screenSize: { width: number; height: number },
    method: string,
  ): void {
    const nx = Math.round((x * 65535) / Math.max(screenSize.width - 1, 1));
    const ny = Math.round((y * 65535) / Math.max(screenSize.height - 1, 1));

    if (method === 'SendInput') {
      // SendInput with MOUSEINPUT - the most modern and reliable approach
      const psScript = [
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        '[StructLayout(LayoutKind.Sequential)]',
        'public struct MOUSEINPUT {',
        '  public int dx;',
        '  public int dy;',
        '  public uint mouseData;',
        '  public uint dwFlags;',
        '  public uint time;',
        '  public IntPtr dwExtraInfo;',
        '}',
        '[StructLayout(LayoutKind.Sequential)]',
        'public struct INPUT {',
        '  public uint type;',
        '  public MOUSEINPUT mi;',
        '}',
        'public class Win32Input {',
        '  [DllImport("user32.dll", SetLastError = true)]',
        '  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);',
        '}',
        '"@',
        '$inp = New-Object INPUT',
        '$inp.type = 0',
        `$inp.mi.dx = ${nx}`,
        `$inp.mi.dy = ${ny}`,
        '$inp.mi.dwFlags = 0x8001',
        '$inp.mi.mouseData = 0',
        '$inp.mi.time = 0',
        '$inp.mi.dwExtraInfo = [IntPtr]::Zero',
        '$r = [Win32Input]::SendInput(1, @($inp), [System.Runtime.InteropServices.Marshal]::SizeOf([type][INPUT]))',
        'if ($r -eq 0) { Write-Error ("SendInput failed: " + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()) }',
      ].join('\r\n');
      this.runPowerShell(psScript);
    } else if (method === 'DpiAwareSetCursorPos') {
      // Set DPI awareness then use SetCursorPos with physical coordinates
      const physX = Math.round(x * this.dpiScale);
      const physY = Math.round(y * this.dpiScale);
      const psScript = [
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class Win32Cursor {',
        '  [DllImport("user32.dll")]',
        '  public static extern bool SetCursorPos(int X, int Y);',
        '  [DllImport("shcore.dll")]',
        '  public static extern int SetProcessDpiAwareness(int value);',
        '}',
        '"@',
        'try { [Win32Cursor]::SetProcessDpiAwareness(2) } catch {}',
        `[Win32Cursor]::SetCursorPos(${physX}, ${physY})`,
      ].join('\r\n');
      this.runPowerShell(psScript);
    } else {
      // mouse_event with MOUSEEVENTF_ABSOLUTE
      const psScript = [
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class Win32Mouse {',
        '  [DllImport("user32.dll")]',
        '  public static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, IntPtr dwExtraInfo);',
        '}',
        '"@',
        `[Win32Mouse]::mouse_event(0x8001, ${nx}, ${ny}, 0, [IntPtr]::Zero)`,
      ].join('\r\n');
      this.runPowerShell(psScript);
    }
  }

  /**
   * Move the mouse to the target position, applying DPI calibration if needed.
   * Target coordinates are in the same space as getMousePos() / AI coordinates.
   */
  private moveMouseCorrected(targetX: number, targetY: number): void {
    assert(libnut, 'libnut not initialized');

    if (this.useWin32MouseFallback) {
      const screenSize = libnut.getScreenSize();
      debugDevice(
        `moveMouseCorrected(Win32 ${this.win32MouseMethod}): target(${targetX}, ${targetY})`,
      );
      this.win32MouseMove(targetX, targetY, screenSize, this.win32MouseMethod);
      return;
    }

    if (!this.mouseCalibrated) {
      libnut.moveMouse(targetX, targetY);
      return;
    }
    // Invert the affine transform: input = (target - offset) / scale
    const inputX = Math.round((targetX - this.mouseOffsetX) / this.mouseScaleX);
    const inputY = Math.round((targetY - this.mouseOffsetY) / this.mouseScaleY);
    debugDevice(
      `moveMouseCorrected: target(${targetX}, ${targetY}) -> input(${inputX}, ${inputY})`,
    );
    libnut.moveMouse(inputX, inputY);
  }

  async screenshotBase64(): Promise<string> {
    if (this.destroyed) {
      throw new Error('ComputerDevice has been destroyed');
    }
    debugDevice('Taking screenshot', { displayId: this.displayId });

    try {
      const options: ScreenshotOptions = { format: 'png' };
      if (this.displayId !== undefined) {
        // On macOS: displayId is numeric (CGDirectDisplayID)
        // On Windows: displayId is string like "\\.\DISPLAY1"
        // On Linux: displayId is string like ":0.0"
        if (process.platform === 'darwin') {
          const screenIndex = Number(this.displayId);
          if (!Number.isNaN(screenIndex)) {
            options.screen = screenIndex;
          }
        } else {
          // Windows and Linux use string IDs directly
          options.screen = this.displayId;
        }
      }

      debugDevice('Screenshot options', options);
      const buffer: Buffer = await screenshot(options);
      return createImgBase64ByFormat('png', buffer.toString('base64'));
    } catch (error) {
      debugDevice(`Screenshot failed: ${error}`);
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }

  async size(): Promise<Size> {
    assert(libnut, 'libnut not initialized');
    try {
      const screenSize = libnut.getScreenSize();
      return {
        width: screenSize.width,
        height: screenSize.height,
      };
    } catch (error) {
      debugDevice(`Failed to get screen size: ${error}`);
      throw new Error(`Failed to get screen size: ${error}`);
    }
  }

  /**
   * Type text via clipboard (paste)
   * This method:
   * 1. Saves the old clipboard content
   * 2. Writes new content to clipboard
   * 3. Simulates paste shortcut (Ctrl+V / Cmd+V)
   * 4. Restores old clipboard content
   */
  private async typeViaClipboard(text: string): Promise<void> {
    assert(libnut, 'libnut not initialized');
    debugDevice('Using clipboard to input text', {
      textLength: text.length,
      preview: text.substring(0, 20),
    });

    const clipboardy = await import('clipboardy');
    // 1. Save old clipboard content
    const oldClipboard = await clipboardy.default.read().catch(() => '');

    try {
      // 2. Write new content to clipboard
      await clipboardy.default.write(text);
      await sleep(50);

      // 3. Simulate paste shortcut
      if (this.useAppleScript) {
        sendKeyViaAppleScript('v', ['command']);
      } else {
        const modifier = process.platform === 'darwin' ? 'command' : 'control';
        libnut.keyTap('v', [modifier]);
      }
      await sleep(100);
    } finally {
      // 4. Restore old clipboard content
      if (oldClipboard) {
        await clipboardy.default.write(oldClipboard).catch(() => {
          // Silent fail - don't affect main flow
          debugDevice('Failed to restore clipboard content');
        });
      }
    }
  }

  /**
   * Always use clipboard paste to input text, avoiding IME interference.
   * Keystroke-based input (AppleScript/libnut) goes through the active input method,
   * which can swallow characters or convert them when a non-English IME is active.
   */
  private async smartTypeString(text: string): Promise<void> {
    assert(libnut, 'libnut not initialized');
    await this.typeViaClipboard(text);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionSpace(): DeviceAction<any>[] {
    const defaultActions: DeviceAction<any>[] = [
      // Tap (single click)
      defineActionTap(async (param: ActionTapParam) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot tap');
        const [x, y] = element.center;
        const targetX = Math.round(x);
        const targetY = Math.round(y);

        // Log active window info before click for diagnostics
        try {
          const activeHandle = libnut.getActiveWindow();
          const title = libnut.getWindowTitle(activeHandle);
          const rect = libnut.getWindowRect(activeHandle);
          debugDevice(
            `Tap(${targetX}, ${targetY}) activeWindow: handle=${activeHandle}, title="${title}", rect=(${rect.x},${rect.y},${rect.width},${rect.height})`,
          );
        } catch (e) {
          debugDevice(
            `Tap(${targetX}, ${targetY}) failed to get window info: ${e}`,
          );
        }

        this.moveMouseCorrected(targetX, targetY);
        // Verify the mouse actually moved to the target position
        const actualPos = libnut.getMousePos();
        debugDevice(
          `Tap moveMouse(${targetX}, ${targetY}) -> actual(${actualPos.x}, ${actualPos.y}), delta=(${actualPos.x - targetX}, ${actualPos.y - targetY})`,
        );
        await sleep(100);
        libnut.mouseClick('left');
        debugDevice(`Tap(${targetX}, ${targetY}) click completed`);
      }),

      // DoubleClick
      defineActionDoubleClick(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot double click');
        const [x, y] = element.center;
        this.moveMouseCorrected(Math.round(x), Math.round(y));
        libnut.mouseClick('left', true);
      }),

      // RightClick
      defineActionRightClick(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot right click');
        const [x, y] = element.center;
        this.moveMouseCorrected(Math.round(x), Math.round(y));
        libnut.mouseClick('right');
      }),

      // MouseMove
      defineAction<typeof actionHoverParamSchema, ActionHoverParam>({
        name: 'MouseMove',
        description: 'Move the mouse to the element',
        interfaceAlias: 'aiHover',
        paramSchema: actionHoverParamSchema,
        call: async (param) => {
          assert(libnut, 'libnut not initialized');
          const element = param.locate as LocateResultElement;
          assert(element, 'Element not found, cannot move mouse');
          const [x, y] = element.center;
          const targetX = Math.round(x);
          const targetY = Math.round(y);

          // Smooth move with DPI correction
          const currentPos = libnut.getMousePos();
          for (let i = 1; i <= SMOOTH_MOVE_STEPS_MOUSE_MOVE; i++) {
            const stepX = Math.round(
              currentPos.x +
                ((targetX - currentPos.x) * i) / SMOOTH_MOVE_STEPS_MOUSE_MOVE,
            );
            const stepY = Math.round(
              currentPos.y +
                ((targetY - currentPos.y) * i) / SMOOTH_MOVE_STEPS_MOUSE_MOVE,
            );
            this.moveMouseCorrected(stepX, stepY);
            await sleep(SMOOTH_MOVE_DELAY_MOUSE_MOVE);
          }
          await sleep(MOUSE_MOVE_EFFECT_WAIT);
        },
      }),

      // Input
      defineAction({
        name: 'Input',
        description: 'Input text into the input field',
        interfaceAlias: 'aiInput',
        paramSchema: z.object({
          value: z.string().describe('The text to input'),
          mode: z
            .enum(['replace', 'clear', 'append'])
            .default('replace')
            .optional()
            .describe('Input mode: replace, clear, or append'),
          locate: getMidsceneLocationSchema()
            .describe('The input field to be filled')
            .optional(),
        }),
        call: async (param) => {
          assert(libnut, 'libnut not initialized');
          const element = param.locate as LocateResultElement | undefined;

          if (element) {
            // Always click to ensure focus
            const [x, y] = element.center;
            this.moveMouseCorrected(Math.round(x), Math.round(y));
            libnut.mouseClick('left');
            await sleep(INPUT_FOCUS_DELAY);

            if (param.mode !== 'append') {
              // Select all and delete
              if (this.useAppleScript) {
                sendKeyViaAppleScript('a', ['command']);
                await sleep(50);
                sendKeyViaAppleScript('backspace', []);
              } else {
                const modifier =
                  process.platform === 'darwin' ? 'command' : 'control';
                libnut.keyTap('a', [modifier]);
                await sleep(50);
                libnut.keyTap('backspace');
              }
              await sleep(INPUT_CLEAR_DELAY);
            }
          }

          if (param.mode === 'clear') {
            return;
          }

          if (!param.value) {
            return;
          }

          await this.smartTypeString(param.value);
        },
      }),

      // Scroll
      defineActionScroll(async (param) => {
        assert(libnut, 'libnut not initialized');

        if (param.locate) {
          const element = param.locate as LocateResultElement;
          const [x, y] = element.center;
          this.moveMouseCorrected(Math.round(x), Math.round(y));
        }

        const scrollType = param?.scrollType;

        // Scroll to edge actions
        const scrollToEdgeActions: Record<string, [number, number]> = {
          scrollToTop: [0, 10],
          scrollToBottom: [0, -10],
          scrollToLeft: [-10, 0],
          scrollToRight: [10, 0],
        };

        const edgeAction = scrollToEdgeActions[scrollType || ''];
        if (edgeAction) {
          const [dx, dy] = edgeAction;
          for (let i = 0; i < SCROLL_REPEAT_COUNT; i++) {
            libnut.scrollMouse(dx, dy);
            await sleep(SCROLL_STEP_DELAY);
          }
          return;
        }

        // Single scroll action
        if (scrollType === 'singleAction' || !scrollType) {
          const distance = param?.distance || 500;
          const ticks = Math.ceil(distance / 100);
          const direction = param?.direction || 'down';

          const directionMap: Record<string, [number, number]> = {
            up: [0, ticks],
            down: [0, -ticks],
            left: [-ticks, 0],
            right: [ticks, 0],
          };

          const [dx, dy] = directionMap[direction] || [0, -ticks];
          libnut.scrollMouse(dx, dy);
          await sleep(SCROLL_COMPLETE_DELAY);
          return;
        }

        throw new Error(
          `Unknown scroll type: ${scrollType}, param: ${JSON.stringify(param)}`,
        );
      }),

      // KeyboardPress
      defineActionKeyboardPress(async (param) => {
        assert(libnut, 'libnut not initialized');

        if (param.locate) {
          const [x, y] = param.locate.center;
          this.moveMouseCorrected(Math.round(x), Math.round(y));
          libnut.mouseClick('left');
          await sleep(50);
        }

        const keys = param.keyName.split('+');
        const modifiers = keys.slice(0, -1).map(normalizeKeyName);
        // Use normalizePrimaryKey for the main key to handle modifier keys pressed alone
        const key = normalizePrimaryKey(keys[keys.length - 1]);

        debugDevice('KeyboardPress', {
          original: param.keyName,
          key,
          modifiers,
          driver: this.useAppleScript ? 'applescript' : 'libnut',
        });

        if (this.useAppleScript) {
          // Use AppleScript for all keys on macOS when keyboardDriver is 'applescript'
          sendKeyViaAppleScript(key, modifiers);
        } else {
          // Use libnut (default)
          if (modifiers.length > 0) {
            libnut.keyTap(key, modifiers);
          } else {
            libnut.keyTap(key);
          }
        }
      }),

      // DragAndDrop
      defineActionDragAndDrop(async (param) => {
        assert(libnut, 'libnut not initialized');
        const from = param.from as LocateResultElement;
        const to = param.to as LocateResultElement;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');

        const [fromX, fromY] = from.center;
        const [toX, toY] = to.center;

        this.moveMouseCorrected(Math.round(fromX), Math.round(fromY));
        libnut.mouseToggle('down', 'left');
        await sleep(100);
        this.moveMouseCorrected(Math.round(toX), Math.round(toY));
        await sleep(100);
        libnut.mouseToggle('up', 'left');
      }),

      // ClearInput
      defineActionClearInput(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot clear input');

        const [x, y] = element.center;
        this.moveMouseCorrected(Math.round(x), Math.round(y));
        libnut.mouseClick('left');
        await sleep(100);

        if (this.useAppleScript) {
          sendKeyViaAppleScript('a', ['command']);
          await sleep(50);
          sendKeyViaAppleScript('backspace', []);
        } else {
          const modifier =
            process.platform === 'darwin' ? 'command' : 'control';
          libnut.keyTap('a', [modifier]);
          libnut.keyTap('backspace');
        }
        await sleep(50);
      }),
    ];

    const platformActions = Object.values(createPlatformActions());
    const customActions = this.options?.customActions || [];

    return [...defaultActions, ...platformActions, ...customActions];
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    if (this.xvfbInstance) {
      this.xvfbInstance.stop();
      this.xvfbInstance = undefined;
    }
    if (this.xvfbCleanup) {
      process.removeListener('exit', this.xvfbCleanup);
      process.removeListener('SIGINT', this.xvfbCleanup);
      process.removeListener('SIGTERM', this.xvfbCleanup);
      this.xvfbCleanup = undefined;
    }

    this.destroyed = true;
    debugDevice('Computer device destroyed');
  }

  async url(): Promise<string> {
    return '';
  }
}

/**
 * Platform-specific actions
 */
function createPlatformActions() {
  return {
    ListDisplays: defineAction({
      name: 'ListDisplays',
      description: 'List all available displays/monitors',
      call: async () => {
        return await ComputerDevice.listDisplays();
      },
    }),
  } as const;
}
