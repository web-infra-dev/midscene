import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type DiscoverDevicesRequest,
  IPC_CHANNELS,
  type WriteReportFileRequest,
} from '@shared/electron-contract';
import { resolveExternalUrl } from '@shared/external-links';
import {
  BrowserWindow,
  type NativeImage,
  app,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import type { TitleBarOverlay } from 'electron';
import { requestPlaygroundBootstrap } from './playground/bootstrap-request';
import type { PlaygroundRuntimeService } from './playground/types';
import { configureStudioShellEnvHydration } from './shell-env';
import { registerWindowRevealHandlers } from './window-reveal';

// macOS GUI launches (Finder, Dock) skip the user's login shell, so
// `ANDROID_HOME`, `PATH` additions for adb/hdc/xcrun, etc. never reach
// `process.env`. Configure the hydrator once here, but only run it lazily
// from the device-specific paths that actually need those binaries.
configureStudioShellEnvHydration({
  isPackaged: app.isPackaged,
  log: (message, error) => console.warn(`[studio:shell-env] ${message}`, error),
});

/**
 * Main process owns native shell concerns only.
 * Future device discovery / agent hosting should be bootstrapped from here and
 * delegated to a dedicated Node-side service, not imported into the renderer.
 */

let mainWindow: BrowserWindow | null = null;
let cachedAppIcon: NativeImage | null = null;
let playgroundRuntimePromise: Promise<PlaygroundRuntimeService> | null = null;
let deviceDiscoveryServicePromise: Promise<
  import('./playground/device-discovery').DeviceDiscoveryService
> | null = null;
const isStudioSmokeTest = process.env.MIDSCENE_STUDIO_SMOKE_TEST === '1';
const isStudioE2ETest = process.env.MIDSCENE_STUDIO_E2E_TEST === '1';
const STUDIO_SMOKE_READY_MARKER = 'MIDSCENE_STUDIO_SMOKE_READY';
const STUDIO_SMOKE_FAILED_MARKER = 'MIDSCENE_STUDIO_SMOKE_FAILED';
const STUDIO_E2E_READY_MARKER = 'MIDSCENE_STUDIO_E2E_READY';
const STUDIO_E2E_FAILED_MARKER = 'MIDSCENE_STUDIO_E2E_FAILED';

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
    // Dev mode: rsbuild dev does not run sync-static-assets, so fall back to
    // the source assets directory next to the package.json.
    path.resolve(__dirname, '../../assets/midscene-icon.png'),
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

const DEFAULT_REPORT_FILE_NAME = 'midscene_report.html';

const ensureHtmlFileName = (value: string) =>
  value.toLowerCase().endsWith('.html') ? value : `${value}.html`;

const resolveDefaultReportSavePath = (defaultFileName?: string) => {
  const safeFileName = path.basename(
    ensureHtmlFileName(defaultFileName?.trim() || DEFAULT_REPORT_FILE_NAME),
  );
  return path.join(app.getPath('downloads'), safeFileName);
};

const getPlaygroundRuntime = async (): Promise<PlaygroundRuntimeService> => {
  if (!playgroundRuntimePromise) {
    playgroundRuntimePromise = import('./playground/multi-platform-runtime')
      .then(({ createMultiPlatformRuntimeService }) =>
        createMultiPlatformRuntimeService({
          deviceDiscoveryService: getDeviceDiscoveryService(),
        }),
      )
      .catch((error) => {
        playgroundRuntimePromise = null;
        throw error;
      });
  }

  return playgroundRuntimePromise;
};

const closePlaygroundRuntime = async (): Promise<void> => {
  if (!playgroundRuntimePromise) {
    return;
  }

  const runtime = await playgroundRuntimePromise;
  await runtime.close();
};

const getDeviceDiscoveryService = async () => {
  if (!deviceDiscoveryServicePromise) {
    deviceDiscoveryServicePromise = import('./playground/device-discovery')
      .then(({ createDeviceDiscoveryService }) =>
        createDeviceDiscoveryService(),
      )
      .catch((error) => {
        deviceDiscoveryServicePromise = null;
        throw error;
      });
  }

  return deviceDiscoveryServicePromise;
};

const createMainWindow = () => {
  const rendererDevUrl = process.env.MIDSCENE_STUDIO_RENDERER_URL;
  const rendererEntryPath = getRendererEntryPath();
  const preloadEntryPath = getPreloadEntryPath();
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
      preload: preloadEntryPath,
      sandbox: false,
    },
  });

  registerWindowRevealHandlers({
    isDestroyed: () => window.isDestroyed(),
    onDidFailLoad: (listener) =>
      window.webContents.once('did-fail-load', listener),
    onDidFinishLoad: (listener) =>
      window.webContents.once('did-finish-load', listener),
    onReadyToShow: (listener) => window.once('ready-to-show', listener),
    show: () => window.show(),
  });

  if (isStudioSmokeTest || isStudioE2ETest) {
    window.webContents.once('did-finish-load', () => {
      if (isStudioSmokeTest) {
        console.log(STUDIO_SMOKE_READY_MARKER);
        setTimeout(() => {
          app.exit(0);
        }, 100);
        return;
      }

      console.log(STUDIO_E2E_READY_MARKER);
    });

    window.webContents.once(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        const failedMarker = isStudioSmokeTest
          ? STUDIO_SMOKE_FAILED_MARKER
          : STUDIO_E2E_FAILED_MARKER;
        console.error(
          `${failedMarker}: did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`,
        );
        app.exit(1);
      },
    );

    window.webContents.once('render-process-gone', (_event, details) => {
      const failedMarker = isStudioSmokeTest
        ? STUDIO_SMOKE_FAILED_MARKER
        : STUDIO_E2E_FAILED_MARKER;
      console.error(`${failedMarker}: render-process-gone ${details.reason}`);
      app.exit(1);
    });
  }

  if (rendererDevUrl) {
    window.loadURL(rendererDevUrl);
  } else {
    void window.loadFile(rendererEntryPath).catch((error) => {
      console.error('Failed to load Midscene Studio renderer:', error);
    });
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
  ipcMain.handle(
    IPC_CHANNELS.chooseReportSavePath,
    async (_event, defaultFileName?: string) => {
      const dialogOptions = {
        title: 'Save Midscene Report',
        defaultPath: resolveDefaultReportSavePath(defaultFileName),
        filters: [
          {
            name: 'HTML Report',
            extensions: ['html'],
          },
        ],
      };
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);

      if (result.canceled || !result.filePath) {
        return null;
      }

      return ensureHtmlFileName(result.filePath);
    },
  );
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
  ipcMain.handle(
    IPC_CHANNELS.writeReportFile,
    async (_event, request: WriteReportFileRequest) => {
      const targetPath = request?.path?.trim();
      if (!targetPath) {
        throw new Error('writeReportFile: path is required');
      }
      if (typeof request.content !== 'string') {
        throw new Error('writeReportFile: content must be a string');
      }

      await writeFile(ensureHtmlFileName(targetPath), request.content, 'utf-8');
    },
  );
  // Multi-platform playground — a single server for Android, iOS,
  // HarmonyOS, and Computer. Legacy channel names (getAndroidPlayground*)
  // are aliased to the same strings in IPC_CHANNELS, so the old
  // renderer code keeps working transparently.
  ipcMain.handle(IPC_CHANNELS.getPlaygroundBootstrap, async () => {
    const runtime = await getPlaygroundRuntime();
    return requestPlaygroundBootstrap(runtime, (error) => {
      console.error(
        'Failed to start Midscene Studio playground runtime:',
        error,
      );
    });
  });
  ipcMain.handle(IPC_CHANNELS.restartPlayground, async () =>
    (await getPlaygroundRuntime()).restart(),
  );
  ipcMain.handle(
    IPC_CHANNELS.discoverDevices,
    async (_event, request?: DiscoverDevicesRequest) =>
      (await getDeviceDiscoveryService()).getSnapshot({
        forceRefresh: request?.forceRefresh,
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.setDiscoveryPollingPaused,
    async (_event, paused: boolean) => {
      (await getDeviceDiscoveryService()).setPollingPaused(Boolean(paused));
    },
  );
  ipcMain.handle(IPC_CHANNELS.runConnectivityTest, async (_event, request) => {
    const { runConnectivityTest } = await import(
      './playground/connectivity-test'
    );
    return runConnectivityTest(request);
  });
};

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(getAppIcon());
  }

  void getDeviceDiscoveryService()
    .then((service) =>
      service.subscribe((devices) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return;
        }

        mainWindow.webContents.send(
          IPC_CHANNELS.discoveredDevicesUpdated,
          devices,
        );
      }),
    )
    .catch((error) => {
      console.error('Failed to initialize device discovery service:', error);
    });

  registerIpcHandlers();
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
  void closePlaygroundRuntime();
  void getDeviceDiscoveryService()
    .then((service) => {
      service.close();
    })
    .catch(() => {
      // ignore cleanup failures during shutdown
    });
});
