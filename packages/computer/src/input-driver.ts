import assert from 'node:assert';
import type { Size } from '@midscene/core';

export interface LibNut {
  getScreenSize(): { width: number; height: number };
  getMousePos(): { x: number; y: number };
  moveMouse(x: number, y: number): void;
  mouseClick(button?: MouseButton, double?: boolean): void;
  mouseToggle(state: 'up' | 'down', button?: MouseButton): void;
  scrollMouse(x: number, y: number): void;
  keyTap(key: string, modifiers?: string[]): void;
  typeString(text: string): void;
  getActiveWindow?(): number;
  getWindowRect?(handle: number): WindowRect;
  focusWindow?(handle: number): void;
}

export type MouseButton = 'left' | 'right' | 'middle';
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface MouseCalibrationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MouseCoordinateCalibration {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

const CALIBRATION_SETTLE_DELAY_MS = 80;
const CALIBRATION_TOLERANCE_PX = 5;
const MIN_CALIBRATION_AXIS_DELTA = 20;
const MIN_VALID_CALIBRATION_SCALE = 0.1;
const MAX_VALID_CALIBRATION_SCALE = 10;

function calibrationPoint(
  bounds: MouseCalibrationBounds,
  ratio: number,
): { x: number; y: number } {
  return {
    x: Math.round(bounds.x + bounds.width * ratio),
    y: Math.round(bounds.y + bounds.height * ratio),
  };
}

/** @internal exported for unit tests — do not consume from outside this package */
export function calculateMouseCoordinateCalibration(
  firstInput: { x: number; y: number },
  firstActual: { x: number; y: number },
  secondInput: { x: number; y: number },
  secondActual: { x: number; y: number },
): MouseCoordinateCalibration {
  const inputDeltaX = secondInput.x - firstInput.x;
  const inputDeltaY = secondInput.y - firstInput.y;
  if (
    Math.abs(inputDeltaX) < MIN_CALIBRATION_AXIS_DELTA ||
    Math.abs(inputDeltaY) < MIN_CALIBRATION_AXIS_DELTA
  ) {
    throw new Error(
      `Mouse calibration points are too close: delta=(${inputDeltaX}, ${inputDeltaY})`,
    );
  }

  const scaleX = (secondActual.x - firstActual.x) / inputDeltaX;
  const scaleY = (secondActual.y - firstActual.y) / inputDeltaY;
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    Math.abs(scaleX) < MIN_VALID_CALIBRATION_SCALE ||
    Math.abs(scaleY) < MIN_VALID_CALIBRATION_SCALE ||
    Math.abs(scaleX) > MAX_VALID_CALIBRATION_SCALE ||
    Math.abs(scaleY) > MAX_VALID_CALIBRATION_SCALE
  ) {
    throw new Error(
      `Mouse calibration produced invalid scale: (${scaleX}, ${scaleY})`,
    );
  }

  return {
    scaleX,
    scaleY,
    offsetX: firstActual.x - scaleX * firstInput.x,
    offsetY: firstActual.y - scaleY * firstInput.y,
  };
}

/** @internal exported for unit tests — do not consume from outside this package */
export function applyMouseCoordinateCalibration(
  point: { x: number; y: number },
  calibration: MouseCoordinateCalibration,
): { x: number; y: number } {
  return {
    x: Math.round((point.x - calibration.offsetX) / calibration.scaleX),
    y: Math.round((point.y - calibration.offsetY) / calibration.scaleY),
  };
}

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ComputerInputDriverOptions {
  getLibnut(): LibNut | null;
  useAppleScript(): boolean;
  sendKeyViaAppleScript(key: string, modifiers?: string[]): void;
  runPhasedScroll(
    direction: ScrollDirection,
    pixels: number,
    steps: number,
  ): boolean;
  debug(message: string): void;
}

export class ComputerInputDriver {
  private destroyed = false;
  private mouseCoordinateCalibration?: MouseCoordinateCalibration;
  private pendingInputDelayWaits = new Set<{
    timeoutId: ReturnType<typeof setTimeout>;
    reject: (error: Error) => void;
  }>();

  constructor(private readonly options: ComputerInputDriverOptions) {}

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.rejectPendingInputDelays();
  }

  getScreenSize(): Size {
    return this.getLibnutOrThrow('getScreenSize').getScreenSize();
  }

  getMousePos(): { x: number; y: number } {
    return this.getLibnutOrThrow('getMousePos').getMousePos();
  }

  moveMouse(x: number, y: number): void {
    const target = this.mouseCoordinateCalibration
      ? applyMouseCoordinateCalibration(
          { x, y },
          this.mouseCoordinateCalibration,
        )
      : { x, y };
    this.getLibnutOrThrow('moveMouse').moveMouse(target.x, target.y);
  }

  /**
   * Measure and invert the coordinate transform applied by the Windows input
   * stack. libnut's moveMouse can be scaled or offset on DPI-scaled and mixed
   * DPI desktops even though getMousePos and screenshots use logical desktop
   * coordinates. Calibrating at two points keeps every pointer primitive in
   * the screenshot coordinate space seen by the model.
   */
  async calibrateMouseCoordinates(
    bounds: MouseCalibrationBounds,
  ): Promise<MouseCoordinateCalibration | undefined> {
    this.assertActive('calibrateMouseCoordinates');
    if (
      !Number.isFinite(bounds.x) ||
      !Number.isFinite(bounds.y) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    ) {
      throw new Error(
        `Mouse calibration bounds are invalid: (${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height})`,
      );
    }

    // Keep raw probes near the top-left. On the broken high-DPI path a raw
    // coordinate can be magnified substantially, so 25%/75% probes may be
    // clamped or spill onto another monitor before we have a correction.
    const firstInput = calibrationPoint(bounds, 0.1);
    const secondInput = calibrationPoint(bounds, 0.3);
    const savedPosition = this.getMousePos();
    this.mouseCoordinateCalibration = undefined;

    try {
      this.moveMouse(firstInput.x, firstInput.y);
      await this.delay(CALIBRATION_SETTLE_DELAY_MS);
      const firstActual = this.getMousePos();

      this.moveMouse(secondInput.x, secondInput.y);
      await this.delay(CALIBRATION_SETTLE_DELAY_MS);
      const secondActual = this.getMousePos();

      const calibration = calculateMouseCoordinateCalibration(
        firstInput,
        firstActual,
        secondInput,
        secondActual,
      );
      const needsCorrection =
        Math.abs(calibration.scaleX - 1) > 0.01 ||
        Math.abs(calibration.scaleY - 1) > 0.01 ||
        Math.abs(calibration.offsetX) > CALIBRATION_TOLERANCE_PX ||
        Math.abs(calibration.offsetY) > CALIBRATION_TOLERANCE_PX;
      this.mouseCoordinateCalibration = needsCorrection
        ? calibration
        : undefined;

      const verificationTarget = calibrationPoint(bounds, 0.5);
      this.moveMouse(verificationTarget.x, verificationTarget.y);
      await this.delay(CALIBRATION_SETTLE_DELAY_MS);
      const verificationActual = this.getMousePos();
      const driftX = verificationActual.x - verificationTarget.x;
      const driftY = verificationActual.y - verificationTarget.y;
      if (
        Math.abs(driftX) > CALIBRATION_TOLERANCE_PX ||
        Math.abs(driftY) > CALIBRATION_TOLERANCE_PX
      ) {
        throw new Error(
          `Mouse coordinate calibration verification failed: expected (${verificationTarget.x}, ${verificationTarget.y}), got (${verificationActual.x}, ${verificationActual.y}), drift=(${driftX}, ${driftY})`,
        );
      }

      this.options.debug(
        needsCorrection
          ? `Mouse coordinate calibration applied: scale=(${calibration.scaleX.toFixed(4)}, ${calibration.scaleY.toFixed(4)}), offset=(${calibration.offsetX.toFixed(1)}, ${calibration.offsetY.toFixed(1)}), verification drift=(${driftX}, ${driftY})`
          : `Mouse coordinate calibration is identity; verification drift=(${driftX}, ${driftY})`,
      );
      this.moveMouse(savedPosition.x, savedPosition.y);
      return this.mouseCoordinateCalibration;
    } catch (error) {
      // Restore using the measured inverse when one is available, then reject
      // the connection. Continuing would make actions report success while
      // clicks land elsewhere.
      try {
        this.moveMouse(savedPosition.x, savedPosition.y);
      } finally {
        this.mouseCoordinateCalibration = undefined;
      }
      throw error;
    }
  }

  focusActiveWindow(): boolean {
    const lib = this.getLibnutOrThrow('focusActiveWindow');
    if (
      typeof lib.getActiveWindow !== 'function' ||
      typeof lib.focusWindow !== 'function'
    ) {
      return false;
    }

    try {
      const handle = lib.getActiveWindow();
      if (!handle) return false;
      lib.focusWindow(handle);
      return true;
    } catch (error) {
      this.options.debug(`focusActiveWindow failed: ${error}`);
      return false;
    }
  }

  getActiveWindowRect(): WindowRect | null {
    const lib = this.getLibnutOrThrow('getActiveWindowRect');
    if (
      typeof lib.getActiveWindow !== 'function' ||
      typeof lib.getWindowRect !== 'function'
    ) {
      return null;
    }

    try {
      const handle = lib.getActiveWindow();
      if (!handle) return null;

      const rect = lib.getWindowRect(handle);
      if (
        !Number.isFinite(rect.x) ||
        !Number.isFinite(rect.y) ||
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height) ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return null;
      }

      return rect;
    } catch (error) {
      this.options.debug(`getActiveWindowRect failed: ${error}`);
      return null;
    }
  }

  mouseClick(button?: MouseButton, double?: boolean): void {
    const lib = this.getLibnutOrThrow('mouseClick');
    // libnut is a native binding that distinguishes "no argument" from
    // "explicit undefined" — passing undefined for optional args trips
    // "A boolean was expected" / "A string was expected" type checks.
    if (double !== undefined) {
      lib.mouseClick(button, double);
    } else if (button !== undefined) {
      lib.mouseClick(button);
    } else {
      lib.mouseClick();
    }
  }

  mouseToggle(state: 'up' | 'down', button: MouseButton = 'left'): void {
    this.getLibnutOrThrow('mouseToggle').mouseToggle(state, button);
  }

  scrollMouse(x: number, y: number): void {
    this.getLibnutOrThrow('scrollMouse').scrollMouse(x, y);
  }

  /**
   * Emit one `libnut.scrollMouse` call per detent and pace them with
   * `delayMs`. Per-call magnitude is fixed by the caller so each call is
   * exactly one detent on the target platform — on Windows the libnut
   * binding forwards `mouseData` straight to `MOUSEEVENTF_WHEEL`, where
   * sub-WHEEL_DELTA values (< 120) get accumulated and frequently dropped
   * by Chromium's WheelEventQueue.
   */
  async emitScrollDetents(
    dx: number,
    dy: number,
    detents: number,
    delayMs: number,
  ): Promise<void> {
    this.assertActive('emitScrollDetents');
    for (let i = 0; i < detents; i++) {
      this.scrollMouse(dx, dy);
      if (i < detents - 1) {
        await this.delay(delayMs);
      }
    }
  }

  keyTap(key: string, modifiers?: string[]): void {
    const lib = this.getLibnutOrThrow('keyTap');
    // See note on mouseClick — avoid passing explicit undefined to libnut.
    if (modifiers !== undefined) {
      lib.keyTap(key, modifiers);
    } else {
      lib.keyTap(key);
    }
  }

  typeString(text: string): void {
    this.getLibnutOrThrow('typeString').typeString(text);
  }

  sendKeyViaAppleScript(key: string, modifiers: string[] = []): void {
    this.assertActive('sendKeyViaAppleScript');
    this.options.sendKeyViaAppleScript(key, modifiers);
  }

  sendKey(key: string, modifiers: string[] = []): void {
    if (this.options.useAppleScript()) {
      this.sendKeyViaAppleScript(key, modifiers);
      return;
    }

    if (modifiers.length > 0) {
      this.keyTap(key, modifiers);
    } else {
      this.keyTap(key);
    }
  }

  runPhasedScroll(
    direction: ScrollDirection,
    pixels: number,
    steps: number,
  ): boolean {
    this.assertActive('runPhasedScroll');
    return this.options.runPhasedScroll(direction, pixels, steps);
  }

  async delay(ms: number): Promise<void> {
    this.assertActive('delay');
    return new Promise((resolve, reject) => {
      const waitRef = {
        timeoutId: setTimeout(() => {
          this.pendingInputDelayWaits.delete(waitRef);
          try {
            this.assertActive('delay');
            resolve();
          } catch (error) {
            reject(error);
          }
        }, ms),
        reject,
      };
      this.pendingInputDelayWaits.add(waitRef);
    });
  }

  async smoothMoveMouse(
    targetX: number,
    targetY: number,
    steps: number,
    stepDelay: number,
  ): Promise<void> {
    const currentPos = this.getMousePos();
    for (let i = 1; i <= steps; i++) {
      const stepX = Math.round(
        currentPos.x + ((targetX - currentPos.x) * i) / steps,
      );
      const stepY = Math.round(
        currentPos.y + ((targetY - currentPos.y) * i) / steps,
      );
      this.moveMouse(stepX, stepY);
      await this.delay(stepDelay);
    }
  }

  async withMouseButton<T>(
    button: MouseButton,
    run: () => Promise<T>,
  ): Promise<T> {
    this.mouseToggle('down', button);
    try {
      return await run();
    } finally {
      this.releaseMouseButton(button);
    }
  }

  private getLibnutOrThrow(methodName: string): LibNut {
    this.assertActive(methodName);
    const libnut = this.options.getLibnut();
    assert(libnut, 'libnut not initialized');
    return libnut;
  }

  private assertActive(methodName: string): void {
    if (this.destroyed) {
      throw this.createDestroyedError(methodName);
    }
  }

  private createDestroyedError(methodName: string): Error {
    return new Error(
      `ComputerDevice has been destroyed (cannot run ${methodName})`,
    );
  }

  private releaseMouseButton(button: MouseButton): void {
    try {
      const libnut = this.options.getLibnut();
      assert(libnut, 'libnut not initialized');
      libnut.mouseToggle('up', button);
    } catch (error) {
      this.options.debug(`Failed to release mouse button ${button}: ${error}`);
    }
  }

  private rejectPendingInputDelays(): void {
    const error = this.createDestroyedError('in-flight input');
    for (const waitRef of this.pendingInputDelayWaits) {
      clearTimeout(waitRef.timeoutId);
      waitRef.reject(error);
    }
    this.pendingInputDelayWaits.clear();
  }
}
