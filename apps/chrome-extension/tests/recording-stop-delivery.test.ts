import { beforeEach, expect, it, rs } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  effects: [] as (() => void)[],
  events: [] as { hashId: string; timestamp: number }[],
  isRecording: true,
  setIsRecording: rs.fn(async (_value: boolean) => {}),
  sendMessage: rs.fn(async (_id: number, _message: unknown) => ({
    success: true,
    error: '',
  })),
  onMessage: undefined as ((message: unknown) => void) | undefined,
  optimize: rs.fn(async (event: unknown) => event),
}));
rs.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect);
  },
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, rs.fn()],
}));
rs.mock('antd', () => ({
  message: {
    error: rs.fn(),
    warning: rs.fn(),
    loading: rs.fn(),
    success: rs.fn(),
  },
}));
rs.mock('../src/store', () => ({
  useRecordStore: Object.assign(
    () => ({
      isRecording: mocks.isRecording,
      events: mocks.events,
      setIsRecording: mocks.setIsRecording,
      addEvent: async (event: { hashId: string; timestamp: number }) => {
        mocks.events.push(event);
      },
      updateEvent: rs.fn(),
      clearEvents: rs.fn(),
      setEvents: rs.fn(),
      emergencySaveEvents: rs.fn(),
    }),
    { getState: () => ({ events: mocks.events }) },
  ),
}));
rs.mock('../src/utils/eventOptimizer', () => ({
  clearDescriptionCache: rs.fn(),
  optimizeEvent: mocks.optimize,
}));
rs.mock('../src/utils/indexedDB', () => ({ dbManager: {} }));
rs.mock('../src/extension/recorder/logger', () => ({
  recordLogger: {
    info: rs.fn(),
    error: rs.fn(),
    success: rs.fn(),
    warn: rs.fn(),
  },
}));
rs.mock('../src/extension/recorder/types', () => ({
  isChromeExtension: () => true,
  safeChromeAPI: {
    runtime: {
      connect: (options: unknown) =>
        chrome.runtime.connect(options as chrome.runtime.ConnectInfo),
    },
    tabs: {
      sendMessage: mocks.sendMessage,
      onUpdated: { addListener: rs.fn(), removeListener: rs.fn() },
    },
  },
}));
rs.mock('../src/extension/recorder/utils', () => ({
  cleanupPreviousRecordings: rs.fn(),
  ensureScriptInjected: rs.fn(),
  exportEventsToFile: rs.fn(),
  generateRecordTitle: rs.fn(),
  generateSessionName: rs.fn(),
  sendContentScriptMessage: rs.fn(),
}));
import { useRecordingControl } from '../src/extension/recorder/hooks/useRecordingControl';

beforeEach(() => {
  rs.clearAllMocks();
  mocks.effects = [];
  mocks.events = [];
  mocks.isRecording = true;
  mocks.optimize.mockImplementation(async (event) => event);
  mocks.sendMessage.mockResolvedValue({ success: true, error: '' });
  rs.stubGlobal('chrome', {
    runtime: {
      connect: () => ({
        onMessage: {
          addListener: (callback: typeof mocks.onMessage) => {
            mocks.onMessage = callback;
          },
        },
        onDisconnect: { addListener: rs.fn() },
        disconnect: rs.fn(),
      }),
    },
  });
});

function setup() {
  const updateSession = rs.fn();
  const control = useRecordingControl(
    { id: 1 } as chrome.tabs.Tab,
    'session',
    () => ({ id: 'session', name: 'Session' }) as never,
    updateSession,
    rs.fn(),
  );
  for (const effect of mocks.effects) effect();
  return { control, updateSession };
}

it('waits for final event processing before disconnecting and persists current events', async () => {
  const { control, updateSession } = setup();
  let finish!: (value: unknown) => void;
  mocks.optimize.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mocks.sendMessage.mockImplementation(async () => {
    mocks.onMessage!({
      action: 'event-update',
      sessionId: 'session',
      data: { hashId: 'final', timestamp: 10 },
    });
    return { success: true, error: '' };
  });
  const stopping = control.stopRecording();
  await rs.waitFor(() => expect(mocks.optimize).toHaveBeenCalled());
  expect(mocks.setIsRecording).not.toHaveBeenCalled();
  finish({ hashId: 'final', timestamp: 10 });
  await stopping;
  expect(mocks.setIsRecording).toHaveBeenCalledWith(false);
  expect(updateSession).toHaveBeenCalledWith(
    'session',
    expect.objectContaining({
      status: 'completed',
      events: [{ hashId: 'final', timestamp: 10 }],
    }),
  );
});

it('keeps reception active and does not complete the session when stop delivery fails', async () => {
  const { control, updateSession } = setup();
  mocks.sendMessage.mockResolvedValue({
    success: false,
    error: 'Disconnected',
  });
  await control.stopRecording();
  expect(mocks.setIsRecording).not.toHaveBeenCalled();
  expect(updateSession).not.toHaveBeenCalled();
});
