import { afterEach, expect, it, rs } from '@rstest/core';

afterEach(() => {
  rs.useRealTimers();
  rs.unstubAllGlobals();
});

it('forwards every buffered event before acknowledging stop', async () => {
  rs.useFakeTimers();
  let onMessage: (
    message: { action: string; sessionId?: string },
    sender: object,
    respond: (value: unknown) => void,
  ) => boolean;
  const sent: { action: string; data?: { value?: string } }[] = [];
  const sendMessage = rs.fn(
    async (message: { action: string; data?: { value?: string } }) => {
      sent.push(message);
      return message.action === 'captureScreenshot'
        ? 'screenshot'
        : { success: true };
    },
  );

  class FakeRecorder {
    active = false;
    constructor(private callback: (event: object) => void) {}
    start() {
      this.active = true;
    }
    stop() {
      this.active = false;
    }
    isActive() {
      return this.active;
    }
    optimizeEvent(event: object, events: object[]) {
      return [...events, event];
    }
    emit(event: object) {
      this.callback(event);
    }
  }

  const page = {
    EventRecorder: FakeRecorder,
    recorder: null as FakeRecorder | null,
    location: { href: 'https://example.com/' },
    addEventListener: rs.fn(),
  };
  rs.stubGlobal('window', page);
  rs.stubGlobal('document', { addEventListener: rs.fn() });
  rs.stubGlobal('history', { pushState: rs.fn(), replaceState: rs.fn() });
  rs.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: typeof onMessage) => {
          onMessage = listener;
        },
      },
    },
  });

  await import('../src/scripts/event-recorder-bridge');
  onMessage!({ action: 'start', sessionId: 'session' }, {}, rs.fn());
  page.recorder!.emit({
    type: 'input',
    value: 'first',
    timestamp: 1,
    hashId: 'first',
  });
  page.recorder!.emit({
    type: 'input',
    value: 'second',
    timestamp: 2,
    hashId: 'second',
  });

  const stopResponse = rs.fn();
  onMessage!({ action: 'stop', sessionId: 'session' }, {}, stopResponse);
  await rs.runAllTimersAsync();

  expect(
    sent
      .filter((message) => message.action === 'event-update')
      .map((message) => message.data?.value),
  ).toEqual(['first', 'second']);
  expect(stopResponse).toHaveBeenCalledWith({ success: true, eventsCount: 2 });
});
