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
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
};

const studioRuntimeApi: StudioRuntimeApi = {
  // Multi-platform playground
  getPlaygroundBootstrap: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getPlaygroundBootstrap),
  restartPlayground: () => ipcRenderer.invoke(IPC_CHANNELS.restartPlayground),
  discoverDevices: () => ipcRenderer.invoke(IPC_CHANNELS.discoverDevices),
  // Legacy aliases — both resolve to the same IPC channel
  getAndroidPlaygroundBootstrap: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getPlaygroundBootstrap),
  restartAndroidPlayground: () =>
    ipcRenderer.invoke(IPC_CHANNELS.restartPlayground),
  runConnectivityTest: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.runConnectivityTest, request),
};

contextBridge.exposeInMainWorld('electronShell', electronShellApi);
contextBridge.exposeInMainWorld('studioRuntime', studioRuntimeApi);
