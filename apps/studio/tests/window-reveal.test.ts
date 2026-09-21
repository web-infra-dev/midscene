import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerWindowRevealHandlers } from '../src/main/window-reveal';

class FakeWindow extends EventEmitter {
  destroyed = false;
  showCalls = 0;
  webContents = new EventEmitter();

  isDestroyed() {
    return this.destroyed;
  }

  show() {
    this.showCalls += 1;
  }
}

function register(window: FakeWindow) {
  return registerWindowRevealHandlers({
    isDestroyed: () => window.isDestroyed(),
    onDidFailLoad: (listener) =>
      window.webContents.once('did-fail-load', listener),
    onDidFinishLoad: (listener) =>
      window.webContents.once('did-finish-load', listener),
    onReadyToShow: (listener) => window.once('ready-to-show', listener),
    show: () => window.show(),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('window reveal handlers', () => {
  it('shows the window when ready-to-show fires', () => {
    const window = new FakeWindow();

    register(window);
    window.emit('ready-to-show');

    expect(window.showCalls).toBe(1);
  });

  it('falls back to did-finish-load when ready-to-show never arrives', () => {
    const window = new FakeWindow();

    register(window);
    window.webContents.emit('did-finish-load');

    expect(window.showCalls).toBe(1);
  });

  it('shows the window on load failure so the user can see the error state', () => {
    const window = new FakeWindow();

    register(window);
    window.webContents.emit('did-fail-load');

    expect(window.showCalls).toBe(1);
  });

  it('does not try to show a destroyed window', () => {
    const window = new FakeWindow();
    window.destroyed = true;

    register(window);
    window.emit('ready-to-show');
    window.webContents.emit('did-finish-load');

    expect(window.showCalls).toBe(0);
  });

  it('reveals the window only once even if multiple events fire', () => {
    const window = new FakeWindow();

    register(window);
    window.webContents.emit('did-finish-load');
    window.emit('ready-to-show');
    window.webContents.emit('did-fail-load');

    expect(window.showCalls).toBe(1);
  });

  it('falls back to a timeout when lifecycle events never arrive', () => {
    vi.useFakeTimers();
    const window = new FakeWindow();

    register(window);
    vi.advanceTimersByTime(2000);

    expect(window.showCalls).toBe(1);
  });

  it('defers activation until the initial reveal completes', () => {
    const window = new FakeWindow();
    const controller = register(window);
    const activate = vi.fn();

    controller.requestActivation(activate);

    expect(controller.hasRevealed()).toBe(false);
    expect(activate).not.toHaveBeenCalled();

    window.emit('ready-to-show');

    expect(controller.hasRevealed()).toBe(true);
    expect(window.showCalls).toBe(1);
    expect(activate).toHaveBeenCalledOnce();
  });

  it('runs activation immediately after the window has been revealed', () => {
    const window = new FakeWindow();
    const controller = register(window);
    const activate = vi.fn();

    window.webContents.emit('did-finish-load');
    controller.requestActivation(activate);

    expect(activate).toHaveBeenCalledOnce();
  });

  it('coalesces repeated activation requests before reveal', () => {
    const window = new FakeWindow();
    const controller = register(window);
    const firstActivation = vi.fn();
    const secondActivation = vi.fn();

    controller.requestActivation(firstActivation);
    controller.requestActivation(secondActivation);
    window.emit('ready-to-show');

    expect(firstActivation).toHaveBeenCalledOnce();
    expect(secondActivation).not.toHaveBeenCalled();
  });

  it('drops activation requests for a destroyed window', () => {
    const window = new FakeWindow();
    const controller = register(window);
    const activate = vi.fn();
    window.destroyed = true;

    controller.requestActivation(activate);
    window.emit('ready-to-show');

    expect(controller.hasRevealed()).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });
});
