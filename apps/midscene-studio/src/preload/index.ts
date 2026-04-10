import { type ElectronShellApi, IPC_CHANNELS } from '@shared/electron-contract';
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

contextBridge.exposeInMainWorld('electronShell', electronShellApi);
