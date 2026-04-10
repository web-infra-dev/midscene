import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type ThemePreference,
  type ThemeSnapshot,
} from '@shared/electron-contract';
import {
  BrowserWindow,
  app,
  ipcMain,
  nativeImage,
  nativeTheme,
} from 'electron';
import type { TitleBarOverlay } from 'electron';

/**
 * Main process owns native shell concerns only.
 * Future device discovery / agent hosting should be bootstrapped from here and
 * delegated to a dedicated Node-side service, not imported into the renderer.
 */

const shellSettingsFileName = 'electron-playground-shell.json';

interface ShellSettings {
  themeSource: ThemePreference;
}

const defaultSettings: ShellSettings = {
  themeSource: 'light',
};

let mainWindow: BrowserWindow | null = null;
let shellSettings: ShellSettings = { ...defaultSettings };

const getSettingsFilePath = () =>
  path.join(app.getPath('userData'), shellSettingsFileName);

const getRendererEntryPath = () =>
  path.join(__dirname, '../renderer/index.html');

const getPreloadEntryPath = () =>
  path.join(__dirname, '../preload/preload.cjs');

const getAppIconPath = () => {
  const candidatePaths = [
    path.resolve(__dirname, '../../../site/docs/public/midscene-icon.png'),
    path.resolve(process.cwd(), 'apps/site/docs/public/midscene-icon.png'),
  ];

  const iconPath = candidatePaths.find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!iconPath) {
    throw new Error(
      `Electron app icon not found. Checked: ${candidatePaths.join(', ')}`,
    );
  }

  return iconPath;
};

const getAppIcon = () => {
  const icon = nativeImage.createFromPath(getAppIconPath());

  if (icon.isEmpty()) {
    throw new Error('Electron app icon could not be loaded.');
  }

  return icon;
};

const getResolvedTheme = (): ThemeSnapshot['resolved'] =>
  nativeTheme.shouldUseDarkColors ? 'dark' : 'light';

const getThemeSnapshot = (): ThemeSnapshot => ({
  source: shellSettings.themeSource,
  resolved: getResolvedTheme(),
});

const getBackgroundColor = () =>
  process.platform === 'darwin'
    ? '#00000000'
    : getResolvedTheme() === 'dark'
      ? '#10151b'
      : '#eef1f5';

const getTitleBarOverlay = (): TitleBarOverlay => ({
  color: '#00000000',
  height: 56,
  symbolColor: getResolvedTheme() === 'dark' ? '#f7fafc' : '#17212b',
});

const readSettings = async (): Promise<ShellSettings> => {
  try {
    const fileContent = await fs.readFile(getSettingsFilePath(), 'utf8');
    const parsed = JSON.parse(fileContent) as Partial<ShellSettings>;
    return {
      themeSource:
        parsed.themeSource === 'light' ||
        parsed.themeSource === 'dark' ||
        parsed.themeSource === 'system'
          ? parsed.themeSource
          : defaultSettings.themeSource,
    };
  } catch {
    return { ...defaultSettings };
  }
};

const writeSettings = async () => {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(
    getSettingsFilePath(),
    JSON.stringify(shellSettings, null, 2),
    'utf8',
  );
};

const syncWindowChrome = () => {
  if (!mainWindow) {
    return;
  }

  mainWindow.setBackgroundColor(getBackgroundColor());

  if (process.platform !== 'darwin') {
    mainWindow.setTitleBarOverlay(getTitleBarOverlay());
  }
};

const broadcastThemeSnapshot = () => {
  const snapshot = getThemeSnapshot();
  syncWindowChrome();
  mainWindow?.webContents.send(IPC_CHANNELS.themeChanged, snapshot);
};

const applyThemeSource = async (source: ThemePreference) => {
  shellSettings = {
    ...shellSettings,
    themeSource: source,
  };
  nativeTheme.themeSource = source;
  await writeSettings();
  broadcastThemeSnapshot();
  return getThemeSnapshot();
};

const createMainWindow = () => {
  const rendererDevUrl = process.env.MIDSCENE_ELECTRON_RENDERER_URL;
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
  ipcMain.handle(IPC_CHANNELS.getThemeSnapshot, () => getThemeSnapshot());
  ipcMain.handle(
    IPC_CHANNELS.updateThemeSource,
    async (_event, source: ThemePreference) => applyThemeSource(source),
  );
  ipcMain.handle(IPC_CHANNELS.minimizeWindow, () => {
    mainWindow?.minimize();
  });
  ipcMain.handle(IPC_CHANNELS.toggleMaximizeWindow, () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return;
    }

    mainWindow.maximize();
  });
  ipcMain.handle(IPC_CHANNELS.closeWindow, () => {
    mainWindow?.close();
  });
};

app.whenReady().then(async () => {
  shellSettings = {
    ...(await readSettings()),
    themeSource: 'light',
  };
  nativeTheme.themeSource = 'light';

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getAppIcon());
  }

  registerIpcHandlers();
  createMainWindow();

  nativeTheme.on('updated', () => {
    broadcastThemeSnapshot();
  });

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
