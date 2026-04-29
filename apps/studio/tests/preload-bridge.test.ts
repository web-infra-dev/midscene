import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/electron-contract';

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}));

async function loadModule() {
  vi.resetModules();
  await import('../src/preload/index');
}

describe('preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(undefined);
  });

  it('exposes shell and studio runtime APIs that proxy over IPC', async () => {
    await loadModule();

    expect(mocks.exposeInMainWorld).toHaveBeenCalledTimes(2);

    const shellApi = mocks.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'electronShell',
    )?.[1];
    const studioRuntimeApi = mocks.exposeInMainWorld.mock.calls.find(
      ([name]) => name === 'studioRuntime',
    )?.[1];

    expect(shellApi).toBeDefined();
    expect(studioRuntimeApi).toBeDefined();

    await shellApi.closeWindow();
    await shellApi.minimizeWindow();
    await shellApi.openExternalUrl('https://midscenejs.com');
    await shellApi.chooseReportSavePath('report.html');
    await shellApi.toggleMaximizeWindow();
    await shellApi.writeReportFile({
      path: '/tmp/report.html',
      content: '<html />',
    });

    await studioRuntimeApi.getPlaygroundBootstrap();
    await studioRuntimeApi.restartPlayground();
    await studioRuntimeApi.discoverDevices();
    const stopListening = studioRuntimeApi.onDiscoveredDevicesChanged(
      () => undefined,
    );
    await studioRuntimeApi.setDiscoveryPollingPaused(true);
    await studioRuntimeApi.runConnectivityTest({
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o',
    });
    stopListening();

    expect(mocks.invoke.mock.calls).toEqual([
      [IPC_CHANNELS.closeWindow],
      [IPC_CHANNELS.minimizeWindow],
      [IPC_CHANNELS.openExternalUrl, 'https://midscenejs.com'],
      [IPC_CHANNELS.chooseReportSavePath, 'report.html'],
      [IPC_CHANNELS.toggleMaximizeWindow],
      [
        IPC_CHANNELS.writeReportFile,
        {
          path: '/tmp/report.html',
          content: '<html />',
        },
      ],
      [IPC_CHANNELS.getPlaygroundBootstrap],
      [IPC_CHANNELS.restartPlayground],
      [IPC_CHANNELS.discoverDevices, undefined],
      [IPC_CHANNELS.setDiscoveryPollingPaused, true],
      [
        IPC_CHANNELS.runConnectivityTest,
        {
          apiKey: 'sk-test',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-4o',
        },
      ],
    ]);
    expect(mocks.on).toHaveBeenCalledWith(
      IPC_CHANNELS.discoveredDevicesUpdated,
      expect.any(Function),
    );
    expect(mocks.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.discoveredDevicesUpdated,
      expect.any(Function),
    );
  });
});
