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
import { createAndroidPlaygroundRuntimeService } from './playground/android-runtime';
import { runConnectivityTest } from './playground/connectivity-test';

/**
 * Main process owns native shell concerns only.
 * Future device discovery / agent hosting should be bootstrapped from here and
 * delegated to a dedicated Node-side service, not imported into the renderer.
 */

let mainWindow: BrowserWindow | null = null;
let cachedAppIcon: NativeImage | null = null;
const androidPlaygroundRuntime = createAndroidPlaygroundRuntimeService();

// Expose the Chromium DevTools Protocol on a fixed port in dev so external
// profilers (e.g. chrome-devtools-mcp at http://localhost:9224) can attach to
// the renderer without the user keeping DevTools open. Production builds never
// set this — it would be a liability. The port can be overridden with the
// MIDSCENE_STUDIO_CDP_PORT env var when multiple dev instances are running.
if (!app.isPackaged) {
  const cdpPort = process.env.MIDSCENE_STUDIO_CDP_PORT ?? '9224';
  app.commandLine.appendSwitch('remote-debugging-port', cdpPort);
  // Bind to loopback so the debug endpoint isn't reachable from the network.
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
}

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
  ipcMain.handle(IPC_CHANNELS.getAndroidPlaygroundBootstrap, () =>
    androidPlaygroundRuntime.getBootstrap(),
  );
  ipcMain.handle(IPC_CHANNELS.restartAndroidPlayground, async () =>
    androidPlaygroundRuntime.restart(),
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
  void androidPlaygroundRuntime.start();
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
  void androidPlaygroundRuntime.close();
});
