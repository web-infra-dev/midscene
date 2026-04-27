import {
  type ElectronShellApi,
  IPC_CHANNELS,
  type StudioRuntimeApi,
} from '@shared/electron-contract';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload is intentionally thin.
 * It exposes a typed bridge and keeps Electron access out of the renderer.
 */

const electronShellApi: ElectronShellApi = {
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
  openExternalUrl: (url) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, url),
  chooseReportSavePath: (defaultFileName) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseReportSavePath, defaultFileName),
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
  writeReportFile: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.writeReportFile, request),
};

const studioRuntimeApi: StudioRuntimeApi = {
  getPlaygroundBootstrap: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getPlaygroundBootstrap),
  restartPlayground: () => ipcRenderer.invoke(IPC_CHANNELS.restartPlayground),
  discoverDevices: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.discoverDevices, request),
  onDiscoveredDevicesChanged: (listener) => {
    const handler = (_event: unknown, devices: unknown) => {
      listener(devices as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on(IPC_CHANNELS.discoveredDevicesUpdated, handler);
    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.discoveredDevicesUpdated,
        handler,
      );
    };
  },
  setDiscoveryPollingPaused: (paused) =>
    ipcRenderer.invoke(IPC_CHANNELS.setDiscoveryPollingPaused, paused),
  runConnectivityTest: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.runConnectivityTest, request),
};

contextBridge.exposeInMainWorld('electronShell', electronShellApi);
contextBridge.exposeInMainWorld('studioRuntime', studioRuntimeApi);
