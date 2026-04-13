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
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
};

const studioRuntimeApi: StudioRuntimeApi = {
  getAndroidPlaygroundBootstrap: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAndroidPlaygroundBootstrap),
  restartAndroidPlayground: () =>
    ipcRenderer.invoke(IPC_CHANNELS.restartAndroidPlayground),
};

contextBridge.exposeInMainWorld('electronShell', electronShellApi);
contextBridge.exposeInMainWorld('studioRuntime', studioRuntimeApi);
