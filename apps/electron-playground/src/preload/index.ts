import {
  type ElectronShellApi,
  IPC_CHANNELS,
  type ThemePreference,
  type ThemeSnapshot,
} from '@shared/electron-contract';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload is intentionally thin.
 * It exposes a typed bridge and keeps Electron access out of the renderer.
 */

const electronShellApi: ElectronShellApi = {
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
  getPlatform: () => process.platform,
  getThemeSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getThemeSnapshot),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
  onThemeChanged: (listener: (snapshot: ThemeSnapshot) => void) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      payload: ThemeSnapshot,
    ) => {
      listener(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.themeChanged, subscription);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.themeChanged, subscription);
    };
  },
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow),
  updateThemeSource: (source: ThemePreference) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateThemeSource, source),
};

contextBridge.exposeInMainWorld('electronShell', electronShellApi);
