import { afterEach, expect, it, rs } from '@rstest/core';
import {
  EventRecorder,
  type RecordedEvent,
} from '../../../packages/recorder/src/recorder';

afterEach(() => {
  rs.useRealTimers();
  rs.unstubAllGlobals();
  rs.resetModules();
});

type Message = {
  action: string;
  data?: RecordedEvent;
  eventIndex?: number;
  replacesHashId?: string;
  sessionId?: string;
};

async function setupBridge(
  deliver: (
    message: Message,
  ) => Promise<{ success: boolean; error?: string }> = async () => ({
    success: true,
  }),
) {
  rs.useFakeTimers();
  let onMessage!: (
    message: Message,
    sender: object,
    respond: (value: unknown) => void,
  ) => boolean;
  const delivered: Message[] = [];
  class FakeRecorder extends EventRecorder {
    active = false;
    constructor(private callback: (event: RecordedEvent) => void) {
      super(callback, 'session');
    }
    start() {
      this.active = true;
    }
    stop() {
      this.active = false;
    }
    isActive() {
      return this.active;
    }
    emit(event: RecordedEvent) {
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
      sendMessage: rs.fn(async (message: Message) => {
        if (message.action === 'captureScreenshot') return 'screenshot';
        const response = await deliver(message);
        if (response.success) delivered.push(message);
        return response;
      }),
      onMessage: {
        addListener: (listener: typeof onMessage) => {
          onMessage = listener;
        },
      },
    },
  });
  await import('../src/scripts/event-recorder-bridge');
  onMessage({ action: 'start', sessionId: 'session' }, {}, rs.fn());
  return {
    delivered,
    emit: (event: RecordedEvent) => page.recorder!.emit(event),
    stop: async () => {
      const respond = rs.fn();
      onMessage({ action: 'stop', sessionId: 'session' }, {}, respond);
      await rs.runAllTimersAsync();
      return respond;
    },
  };
}

const event = (
  hashId: string,
  value?: string,
  element?: RecordedEvent['element'],
): RecordedEvent => ({
  type: value === undefined ? 'click' : 'input',
  value,
  element,
  timestamp: 1,
  hashId,
  pageInfo: { url: 'https://example.com/', title: 'Example' },
});

it('forwards every buffered event before acknowledging stop', async () => {
  const bridge = await setupBridge();
  bridge.emit(
    event('first', 'first', { value: 'first' } as RecordedEvent['element']),
  );
  bridge.emit(
    event('second', 'second', { value: 'second' } as RecordedEvent['element']),
  );
  const response = await bridge.stop();
  expect(bridge.delivered.map(({ data }) => data?.value)).toEqual([
    'first',
    'second',
  ]);
  expect(response).toHaveBeenCalledWith({ success: true, eventsCount: 2 });
});

it('resends an optimized input followed by a click and skips acknowledged versions on stop', async () => {
  const bridge = await setupBridge();
  const element = { value: 'a' } as RecordedEvent['element'];
  bridge.emit(event('first', 'a', element));
  await rs.advanceTimersByTimeAsync(200);
  bridge.emit(event('updated', 'abc', element));
  bridge.emit(event('click'));
  await rs.advanceTimersByTimeAsync(200);
  const response = await bridge.stop();
  expect(
    bridge.delivered.map(({ data, eventIndex, replacesHashId }) => [
      data?.hashId,
      data?.value,
      eventIndex,
      replacesHashId,
    ]),
  ).toEqual([
    ['first', 'a', 0, undefined],
    ['updated', 'abc', 0, 'first'],
    ['click', undefined, 1, undefined],
  ]);
  expect(response).toHaveBeenCalledWith({ success: true, eventsCount: 2 });
});

it('retries a failed delivery on stop', async () => {
  let attempts = 0;
  const bridge = await setupBridge(async () => {
    if (++attempts === 1) throw new Error('Disconnected');
    return { success: true };
  });
  bridge.emit(event('input', 'final'));
  await rs.advanceTimersByTimeAsync(200);
  const response = await bridge.stop();
  expect(attempts).toBe(2);
  expect(bridge.delivered).toHaveLength(1);
  expect(response).toHaveBeenCalledWith({ success: true, eventsCount: 1 });
});

it('does not acknowledge stop when the worker rejects delivery', async () => {
  const bridge = await setupBridge(async () => ({
    success: false,
    error: 'No recording page',
  }));
  bridge.emit(event('input', 'final'));
  const response = await bridge.stop();
  expect(bridge.delivered).toHaveLength(0);
  expect(response).toHaveBeenCalledWith({
    success: false,
    error: 'Error: No recording page',
  });
});
