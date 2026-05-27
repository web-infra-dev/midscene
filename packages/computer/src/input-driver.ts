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
}

export type MouseButton = 'left' | 'right' | 'middle';
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

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
    this.getLibnutOrThrow('moveMouse').moveMouse(x, y);
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

  keyTap(key: string, modifiers?: string[]): void {
    const lib = this.getLibnutOrThrow('keyTap');
    // See note on mouseClick — avoid passing explicit undefined to libnut.
    if (modifiers !== undefined) {
      lib.keyTap(key, modifiers);
    } else {
      lib.keyTap(key);
    }
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
