import {
  type ElectronShellApi,
  IPC_CHANNELS,
  type StudioRuntimeApi,
} from '@shared/electron-contract';
import type { UpdateStatus, UpdaterApi } from '@shared/updater-contract';
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
  chooseFileSavePath: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseFileSavePath, request),
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
  writeReportFile: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.writeReportFile, request),
  writeFile: (request) => ipcRenderer.invoke(IPC_CHANNELS.writeFile, request),
  setNativeTheme: (mode) =>
    ipcRenderer.invoke(IPC_CHANNELS.setNativeTheme, mode),
  onSystemThemeChanged: (listener) => {
    const handler = (_event: unknown, resolved: unknown) => {
      if (resolved === 'light' || resolved === 'dark') {
        listener(resolved);
      }
    };
    ipcRenderer.on(IPC_CHANNELS.systemThemeChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.systemThemeChanged, handler);
    };
  },
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
  generateRecorderYaml: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateRecorderYaml, request),
  generateRecorderCode: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateRecorderCode, request),
  generateRecorderMetadata: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateRecorderMetadata, request),
};

const updaterApi: UpdaterApi = {
  check: () => ipcRenderer.invoke(IPC_CHANNELS.updaterCheck),
  download: () => ipcRenderer.invoke(IPC_CHANNELS.updaterDownload),
  install: () => ipcRenderer.invoke(IPC_CHANNELS.updaterInstall),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.updaterGetVersion),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updaterGetStatus),
  onStatus: (callback: (status: UpdateStatus) => void) => {
    const handler = (_event: unknown, status: UpdateStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.updaterStatus, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.updaterStatus, handler);
  },
};

contextBridge.exposeInMainWorld('electronShell', electronShellApi);
contextBridge.exposeInMainWorld('studioRuntime', studioRuntimeApi);
contextBridge.exposeInMainWorld('studioUpdater', updaterApi);
