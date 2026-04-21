import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
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
  registerWindowRevealHandlers({
    isDestroyed: () => window.isDestroyed(),
    onDidFailLoad: (listener) =>
      window.webContents.once('did-fail-load', listener),
    onDidFinishLoad: (listener) =>
      window.webContents.once('did-finish-load', listener),
    onReadyToShow: (listener) => window.once('ready-to-show', listener),
    show: () => window.show(),
  });
}

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
});
