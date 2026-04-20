import assert from 'node:assert';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import screenshot from 'screenshot-desktop';
import type { XvfbInstance } from './xvfb';
import { checkXvfbInstalled, needsXvfb, startXvfb } from './xvfb';

declare const __VERSION__: string;

// Type definitions
interface LibNut {
  getScreenSize(): { width: number; height: number };
  getMousePos(): { x: number; y: number };
  moveMouse(x: number, y: number): void;
  mouseClick(button?: 'left' | 'right' | 'middle', double?: boolean): void;
  mouseToggle(state: 'up' | 'down', button?: 'left' | 'right' | 'middle'): void;
  scrollMouse(x: number, y: number): void;
  keyTap(key: string, modifiers?: string[]): void;
  typeString(text: string): void;
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

// Input action schema for computer
const computerInputParamSchema = z.object({
  value: z.string().describe('The text to input'),
  mode: z
    .enum(['replace', 'clear', 'append'])
    .default('replace')
    .optional()
    .describe('Input mode: replace, clear, or append'),
  locate: getMidsceneLocationSchema()
    .describe('The input field to be filled')
    .optional(),
});
type ComputerInputParam = {
  value: string;
  mode?: 'replace' | 'clear' | 'append';
  locate?: LocateResultElement;
};

// Constants
const SMOOTH_MOVE_STEPS_TAP = 8;
const SMOOTH_MOVE_STEPS_MOUSE_MOVE = 10;
const SMOOTH_MOVE_DELAY_TAP = 8;
const SMOOTH_MOVE_DELAY_MOUSE_MOVE = 10;
const MOUSE_MOVE_EFFECT_WAIT = 300;
const CLICK_HOLD_DURATION = 50;
const INPUT_FOCUS_DELAY = 300;
const INPUT_CLEAR_DELAY = 150;
const SCROLL_REPEAT_COUNT = 10;
const SCROLL_STEP_DELAY = 100;
const SCROLL_COMPLETE_DELAY = 500;
// Edge scrolls (scrollToTop / scrollToBottom / ...) use a large total
// distance so ordinary pages clamp at the boundary. The step count controls
// smoothness; 400 steps at ~16ms each is ~6.4s in the worst case but WebKit
// short-circuits the remaining events once the boundary is reached.
const EDGE_SCROLL_TOTAL_PX = 50_000;
const EDGE_SCROLL_STEPS = 400;
// singleAction vertical/horizontal scroll: target ~30px per step and a
// minimum of 10 steps so small distances still feel momentum-like.
const PHASED_PIXELS_PER_STEP = 30;
const PHASED_MIN_STEPS = 10;
// Approximate viewport height for mapping "distance in px" to PageUp/PageDown
// count when falling back to keyboard navigation.
const APPROX_VIEWPORT_HEIGHT_PX = 600;

type EdgeScrollType =
  | 'scrollToTop'
  | 'scrollToBottom'
  | 'scrollToLeft'
  | 'scrollToRight';
type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface EdgeScrollStrategy {
  direction: ScrollDirection;
  key: 'home' | 'end';
  libnut: readonly [number, number];
}

// Single source of truth for edge scroll dispatch. Adding a new scrollType
// only requires one entry here; the three backends (phased binary /
// AppleScript / libnut) all read from the same spec.
const EDGE_SCROLL_SPEC: Record<EdgeScrollType, EdgeScrollStrategy> = {
  scrollToTop: { direction: 'up', key: 'home', libnut: [0, 10] },
  scrollToBottom: { direction: 'down', key: 'end', libnut: [0, -10] },
  scrollToLeft: { direction: 'left', key: 'home', libnut: [-10, 0] },
  scrollToRight: { direction: 'right', key: 'end', libnut: [10, 0] },
};

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
  } else {
    const escapedKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    script = `tell application "System Events" to keystroke "${escapedKey}"${modifierStr}`;
  }

  debugDevice('sendKeyViaAppleScript', { key, modifiers, script });
  execFileSync('osascript', ['-e', script]);
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

/**
 * Resolve the phased-scroll helper binary bundled with the package.
 *
 * The binary is a tiny CoreGraphics helper that posts trackpad-like scroll
 * events with proper gesture phase markers, which WebKit and modern AppKit
 * scroll views accept without needing keyboard focus — unlike libnut's
 * phase-less CGScrollEvent path.
 *
 * Returns null on non-darwin or when the binary is missing (expected if a
 * consumer stripped the optional `bin/darwin/` directory from their install).
 */
let phasedScrollBinaryPath: string | null | undefined;
/** @internal exported for unit tests — do not consume from outside this package */
export function getPhasedScrollBinary(): string | null {
  if (phasedScrollBinaryPath !== undefined) return phasedScrollBinaryPath;
  if (process.platform !== 'darwin') {
    phasedScrollBinaryPath = null;
    return null;
  }

  // Resolve the package root via its own package.json so the lookup is
  // independent of how the library is bundled (src/ during dev, dist/lib
  // or dist/es after rslib build). require.resolve handles pnpm layouts,
  // symlinks, and nested workspaces out of the box.
  const require = createRequire(import.meta.url);
  let pkgRoot: string | null = null;
  try {
    pkgRoot = dirname(require.resolve('@midscene/computer/package.json'));
  } catch {
    // Fallback for the dev/test path where the package is not resolvable by
    // its public name (e.g. tests import from src directly).
    const hereDir = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
      resolve(hereDir, '..'), // src/device.ts -> package root
      resolve(hereDir, '../..'), // dist/{lib,es}/*.js -> package root
    ]) {
      if (existsSync(resolve(candidate, 'package.json'))) {
        pkgRoot = candidate;
        break;
      }
    }
  }
  if (!pkgRoot) {
    debugDevice('phased-scroll: cannot locate @midscene/computer package root');
    phasedScrollBinaryPath = null;
    return null;
  }

  const binPath = resolve(pkgRoot, 'bin/darwin/phased-scroll');
  if (!existsSync(binPath)) {
    debugDevice('phased-scroll binary not found at', binPath);
    phasedScrollBinaryPath = null;
    return null;
  }
  phasedScrollBinaryPath = binPath;
  return binPath;
}

/** @internal exported for unit tests — do not consume from outside this package */
export function ensurePhasedScrollBinaryExecutable(binPath: string): boolean {
  try {
    const currentMode = statSync(binPath).mode & 0o777;
    if ((currentMode & 0o111) !== 0) {
      return true;
    }

    const repairedMode = currentMode | 0o111;
    chmodSync(binPath, repairedMode);
    debugDevice('phased-scroll permissions repaired', {
      binPath,
      from: currentMode.toString(8),
      to: repairedMode.toString(8),
    });
    return true;
  } catch (err) {
    debugDevice('failed to ensure phased-scroll is executable', {
      binPath,
      err,
    });
    return false;
  }
}

let phasedScrollExecWarned = false;
/** @internal exported for unit tests — do not consume from outside this package */
export function runPhasedScroll(
  direction: ScrollDirection,
  pixels: number,
  steps: number,
): boolean {
  const bin = getPhasedScrollBinary();
  if (!bin) return false;
  ensurePhasedScrollBinaryExecutable(bin);
  // phased-scroll posts events at the current cursor location — callers that
  // care about routing should move the mouse before invoking.
  try {
    const res = spawnSync(
      bin,
      [direction, String(Math.max(1, Math.round(pixels))), String(steps)],
      { stdio: 'ignore' },
    );
    if (res.status === 0) return true;
    if (!phasedScrollExecWarned) {
      phasedScrollExecWarned = true;
      console.warn(
        `[@midscene/computer] phased-scroll helper exited with status ${res.status}; falling back to keyboard/libnut. This usually means Accessibility permission has not been granted to the host process.`,
      );
    }
    debugDevice('phased-scroll exited non-zero', res.status, res.error);
    return false;
  } catch (err) {
    if (!phasedScrollExecWarned) {
      phasedScrollExecWarned = true;
      console.warn(
        `[@midscene/computer] phased-scroll helper failed to spawn (${(err as Error)?.message}); falling back to keyboard/libnut.`,
      );
    }
    debugDevice('phased-scroll spawn failed', err);
    return false;
  }
}

/**
 * Smooth mouse movement to trigger mousemove events
 */
async function smoothMoveMouse(
  targetX: number,
  targetY: number,
  steps: number,
  stepDelay: number,
): Promise<void> {
  assert(libnut, 'libnut not initialized');
  const currentPos = libnut.getMousePos();
  for (let i = 1; i <= steps; i++) {
    const stepX = Math.round(
      currentPos.x + ((targetX - currentPos.x) * i) / steps,
    );
    const stepY = Math.round(
      currentPos.y + ((targetY - currentPos.y) * i) / steps,
    );
    libnut.moveMouse(stepX, stepY);
    await sleep(stepDelay);
  }
}

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

      this.description = `
Type: Computer
Platform: ${process.platform}
Display: ${this.displayId || 'Primary'}
Screen Size: ${size.width}x${size.height}
Available Displays: ${displays.length > 0 ? displays.map((d) => d.name).join(', ') : 'Unknown'}${headlessInfo}
`;
      debugDevice('Computer device connected', this.description);
      // Health check: verify screenshot and mouse control are working
      await this.healthCheck();
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
    console.log(`[HealthCheck] @midscene/computer v${__VERSION__}`);

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

    // Detect if moveMouse actually worked
    const deltaX = Math.abs(movedPos.x - targetX);
    const deltaY = Math.abs(movedPos.y - targetY);
    if (deltaX > 5 || deltaY > 5) {
      const msg = `[HealthCheck] WARNING: Mouse control may not be working. Expected (${targetX}, ${targetY}), got (${movedPos.x}, ${movedPos.y}), delta=(${deltaX}, ${deltaY})`;
      console.warn(msg);
      debugDevice(msg);

      if (process.platform === 'win32' && !this.isRunningAsAdmin()) {
        const hint =
          'Midscene is NOT running as Administrator. ' +
          'Windows blocks mouse/keyboard input to elevated (admin) applications from non-admin processes (UIPI). ' +
          'Please run your terminal or Node.js as Administrator and try again.';
        console.error(`\n[HealthCheck] ${hint}\n`);
        debugDevice(hint);
      }
    }

    // Restore original position
    libnut.moveMouse(startPos.x, startPos.y);
    console.log(
      `[HealthCheck] Mouse restored to (${startPos.x}, ${startPos.y})`,
    );

    // Step 3: List available monitors
    console.log('[HealthCheck] Listing monitors...');
    const displays = await ComputerDevice.listDisplays();
    if (displays.length > 0) {
      console.log(`[HealthCheck] Found ${displays.length} monitor(s):`);
      for (const display of displays) {
        const primaryTag = display.primary ? ' (primary)' : '';
        console.log(
          `[HealthCheck]   - id=${display.id}, name=${display.name}${primaryTag}`,
        );
      }
    } else {
      console.log('[HealthCheck] No monitors detected');
    }

    console.log('[HealthCheck] Health check passed');
  }

  /**
   * Check if the current process is running with Administrator privileges.
   * Uses "net session" which succeeds only when elevated.
   */
  private isRunningAsAdmin(): boolean {
    if (process.platform !== 'win32') return false;
    try {
      execSync('net session', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
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

        await smoothMoveMouse(
          targetX,
          targetY,
          SMOOTH_MOVE_STEPS_TAP,
          SMOOTH_MOVE_DELAY_TAP,
        );
        // Use mouseToggle for more realistic click behavior
        libnut.mouseToggle('down', 'left');
        await sleep(CLICK_HOLD_DURATION);
        libnut.mouseToggle('up', 'left');
      }),

      // DoubleClick
      defineActionDoubleClick(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot double click');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('left', true);
      }),

      // RightClick
      defineActionRightClick(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot right click');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('right');
      }),

      // MouseMove
      defineAction<typeof actionHoverParamSchema, ActionHoverParam>({
        name: 'MouseMove',
        description: 'Move the mouse to the element',
        interfaceAlias: 'aiHover',
        paramSchema: actionHoverParamSchema,
        sample: {
          locate: { prompt: 'the navigation menu item "Products"' },
        },
        call: async (param) => {
          assert(libnut, 'libnut not initialized');
          const element = param.locate as LocateResultElement;
          assert(element, 'Element not found, cannot move mouse');
          const [x, y] = element.center;
          const targetX = Math.round(x);
          const targetY = Math.round(y);

          await smoothMoveMouse(
            targetX,
            targetY,
            SMOOTH_MOVE_STEPS_MOUSE_MOVE,
            SMOOTH_MOVE_DELAY_MOUSE_MOVE,
          );
          await sleep(MOUSE_MOVE_EFFECT_WAIT);
        },
      }),

      // Input
      defineAction<typeof computerInputParamSchema, ComputerInputParam>({
        name: 'Input',
        description: 'Input text into the input field',
        interfaceAlias: 'aiInput',
        paramSchema: computerInputParamSchema,
        sample: {
          value: 'test@example.com',
          locate: { prompt: 'the email input field' },
        },
        call: async (param) => {
          assert(libnut, 'libnut not initialized');
          const element = param.locate as LocateResultElement | undefined;

          if (element) {
            // Always click to ensure focus
            const [x, y] = element.center;
            libnut.moveMouse(Math.round(x), Math.round(y));
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
          libnut.moveMouse(Math.round(x), Math.round(y));
        }

        const scrollType = param?.scrollType;

        const edgeSpec =
          scrollType && scrollType in EDGE_SCROLL_SPEC
            ? EDGE_SCROLL_SPEC[scrollType as EdgeScrollType]
            : null;
        if (edgeSpec) {
          // Preferred path on macOS: phased scroll helper emits trackpad-like
          // events that WebKit / Filo / AppKit scroll views accept without
          // keyboard focus. Fires a very large distance so normal pages hit
          // the edge; modern scroll views clamp at the boundary.
          if (
            runPhasedScroll(
              edgeSpec.direction,
              EDGE_SCROLL_TOTAL_PX,
              EDGE_SCROLL_STEPS,
            )
          ) {
            await sleep(SCROLL_COMPLETE_DELAY);
            return;
          }

          // Fallback: keyboard via AppleScript (requires the scroll view to
          // be focused, but works for many already-focused Cocoa apps).
          if (this.useAppleScript) {
            sendKeyViaAppleScript(edgeSpec.key);
            await sleep(SCROLL_COMPLETE_DELAY);
            return;
          }

          // Last-resort fallback: libnut scroll-wheel ticks. WebKit silently
          // drops these, but non-web apps on Linux/Windows still respond.
          const [dx, dy] = edgeSpec.libnut;
          for (let i = 0; i < SCROLL_REPEAT_COUNT; i++) {
            libnut.scrollMouse(dx, dy);
            await sleep(SCROLL_STEP_DELAY);
          }
          return;
        }

        // Single scroll action
        if (scrollType === 'singleAction' || !scrollType) {
          const distance = param?.distance || 500;
          const direction = (param?.direction || 'down') as ScrollDirection;
          const isKnownDirection =
            direction === 'up' ||
            direction === 'down' ||
            direction === 'left' ||
            direction === 'right';

          if (isKnownDirection) {
            const steps = Math.max(
              PHASED_MIN_STEPS,
              Math.round(distance / PHASED_PIXELS_PER_STEP),
            );
            if (runPhasedScroll(direction, distance, steps)) {
              await sleep(SCROLL_COMPLETE_DELAY);
              return;
            }
          }

          // Fallback on macOS: keyboard PageUp/PageDown (vertical only).
          if (
            this.useAppleScript &&
            (direction === 'up' || direction === 'down')
          ) {
            const pages = Math.max(
              1,
              Math.round(distance / APPROX_VIEWPORT_HEIGHT_PX),
            );
            const key = direction === 'up' ? 'pageup' : 'pagedown';
            for (let i = 0; i < pages; i++) {
              sendKeyViaAppleScript(key);
              await sleep(SCROLL_STEP_DELAY);
            }
            await sleep(SCROLL_COMPLETE_DELAY);
            return;
          }

          const ticks = Math.ceil(distance / 100);
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
          libnut.moveMouse(Math.round(x), Math.round(y));
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

        libnut.moveMouse(Math.round(fromX), Math.round(fromY));
        libnut.mouseToggle('down', 'left');
        await sleep(100);
        libnut.moveMouse(Math.round(toX), Math.round(toY));
        await sleep(100);
        libnut.mouseToggle('up', 'left');
      }),

      // ClearInput
      defineActionClearInput(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot clear input');

        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
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
