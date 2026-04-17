import { existsSync } from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '@shared/electron-contract';
import { resolveExternalUrl } from '@shared/external-links';
import {
  BrowserWindow,
  type NativeImage,
  app,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import type { TitleBarOverlay } from 'electron';
import { runConnectivityTest } from './playground/connectivity-test';
import { discoverAllDevices } from './playground/device-discovery';
import { createMultiPlatformRuntimeService } from './playground/multi-platform-runtime';

/**
 * Main process owns native shell concerns only.
 * Future device discovery / agent hosting should be bootstrapped from here and
 * delegated to a dedicated Node-side service, not imported into the renderer.
 */

let mainWindow: BrowserWindow | null = null;
let cachedAppIcon: NativeImage | null = null;
const playgroundRuntime = createMultiPlatformRuntimeService();

const getRendererEntryPath = () =>
  path.join(__dirname, '../renderer/index.html');

const getPreloadEntryPath = () =>
  path.join(__dirname, '../preload/preload.cjs');

const getAppIconPath = () => {
  const candidatePaths = [
    path.resolve(process.resourcesPath, 'assets/midscene-icon.png'),
    path.resolve(app.getAppPath(), 'assets/midscene-icon.png'),
    path.resolve(__dirname, '../assets/midscene-icon.png'),
  ];

  const iconPath = candidatePaths.find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!iconPath) {
    throw new Error(
      `Midscene Studio app icon not found. Checked: ${candidatePaths.join(', ')}`,
    );
  }

  return iconPath;
};

const getAppIcon = () => {
  if (cachedAppIcon) {
    return cachedAppIcon;
  }

  const icon = nativeImage.createFromPath(getAppIconPath());

  if (icon.isEmpty()) {
    throw new Error('Midscene Studio app icon could not be loaded.');
  }

  cachedAppIcon = icon;
  return icon;
};

const getBackgroundColor = () =>
  process.platform === 'darwin' ? '#00000000' : '#eef1f5';

const getTitleBarOverlay = (): TitleBarOverlay => ({
  color: '#00000000',
  height: 56,
  symbolColor: '#17212b',
});

const createMainWindow = () => {
  const rendererDevUrl = process.env.MIDSCENE_STUDIO_RENDERER_URL;
  const appIcon = getAppIcon();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: getBackgroundColor(),
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'darwin' ? undefined : getTitleBarOverlay(),
    trafficLightPosition:
      process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    transparent: process.platform === 'darwin',
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    backgroundMaterial: process.platform === 'win32' ? 'mica' : undefined,
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadEntryPath(),
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (rendererDevUrl) {
    window.loadURL(rendererDevUrl);
  } else {
    window.loadFile(getRendererEntryPath());
  }

  mainWindow = window;
};

const registerIpcHandlers = () => {
  ipcMain.handle(IPC_CHANNELS.minimizeWindow, () => {
    mainWindow?.minimize();
  });
  ipcMain.handle(IPC_CHANNELS.openExternalUrl, async (_event, url: string) => {
    await shell.openExternal(resolveExternalUrl(url));
  });
  ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle(IPC_CHANNELS.closeWindow, () => {
    mainWindow?.close();
  });
  // Multi-platform playground — a single server for Android, iOS,
  // HarmonyOS, and Computer. Legacy channel names (getAndroidPlayground*)
  // are aliased to the same strings in IPC_CHANNELS, so the old
  // renderer code keeps working transparently.
  ipcMain.handle(IPC_CHANNELS.getPlaygroundBootstrap, () =>
    playgroundRuntime.getBootstrap(),
  );
  ipcMain.handle(IPC_CHANNELS.restartPlayground, async () =>
    playgroundRuntime.restart(),
  );
  ipcMain.handle(IPC_CHANNELS.discoverDevices, async () =>
    discoverAllDevices(),
  );
  ipcMain.handle(IPC_CHANNELS.runConnectivityTest, async (_event, request) =>
    runConnectivityTest(request),
  );
};

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getAppIcon());
  }

  registerIpcHandlers();
  void playgroundRuntime.start();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void playgroundRuntime.close();
});
