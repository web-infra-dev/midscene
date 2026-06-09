const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, screen, shell } = require('electron');
const {
  agentFromComputer,
  checkAccessibilityPermission,
} = require('@midscene/computer');
const { PlaygroundServer } = require('@midscene/playground');
const { PLAYGROUND_SERVER_PORT } = require('@midscene/shared/constants');
const { findAvailablePort } = require('@midscene/shared/node');

const APP_TITLE = 'Midscene Computer Playground';
const STATIC_RESOURCE_DIR = 'computer-playground-static';

let mainWindow = null;
let playgroundServer = null;
let isClosingServer = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getStaticDir = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, STATIC_RESOURCE_DIR);
  }

  return path.resolve(__dirname, '../../packages/computer-playground/static');
};

const validateStaticDir = (staticDir) => {
  const indexPath = path.join(staticDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Computer playground static assets were not found at ${staticDir}. Run "pnpm --filter computer-desktop build" before starting the desktop app.`,
    );
  }
};

const restoreMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

const isSameOrigin = (targetUrl, origin) => {
  try {
    return new URL(targetUrl).origin === origin;
  } catch {
    return false;
  }
};

const registerExecutionWindowControls = (server) => {
  server.app.use('/execute', async (_req, res, next) => {
    await sleep(1500);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }

    res.once('finish', restoreMainWindow);
    next();
  });
};

const startPlaygroundServer = async () => {
  const staticDir = getStaticDir();
  validateStaticDir(staticDir);

  const server = new PlaygroundServer(async () => {
    return agentFromComputer();
  }, staticDir);

  registerExecutionWindowControls(server);

  const availablePort = await findAvailablePort(PLAYGROUND_SERVER_PORT);
  await server.launch(availablePort);
  playgroundServer = server;

  return server.port || availablePort;
};

const createMainWindow = async (url) => {
  const workArea = screen.getPrimaryDisplay().workArea;
  const playgroundOrigin = new URL(url).origin;
  const windowWidth = 500;
  const windowHeight = Math.min(workArea.height, 1200);

  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: windowWidth,
    height: windowHeight,
    x: workArea.x + workArea.width - windowWidth,
    y: workArea.y,
    minWidth: 420,
    minHeight: 640,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isSameOrigin(targetUrl, playgroundOrigin)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
};

const ensureAccessibilityPermission = () => {
  const accessibilityCheck = checkAccessibilityPermission(true);

  if (!accessibilityCheck.hasPermission) {
    dialog.showErrorBox(
      'Accessibility Permission Required',
      accessibilityCheck.error ||
        'Midscene Computer Playground requires macOS Accessibility permission.',
    );
    app.quit();
    return false;
  }

  return true;
};

const closePlaygroundServer = async () => {
  if (!playgroundServer) {
    return;
  }

  const server = playgroundServer;
  playgroundServer = null;
  await server.close();
};

const startApp = async () => {
  if (!ensureAccessibilityPermission()) {
    return;
  }

  const port = await startPlaygroundServer();
  await createMainWindow(`http://localhost:${port}`);
};

app
  .whenReady()
  .then(startApp)
  .catch((error) => {
    console.error('Failed to start Midscene Computer Playground:', error);
    dialog.showErrorBox(
      'Failed to Start',
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });

app.on('before-quit', (event) => {
  if (isClosingServer || !playgroundServer) {
    return;
  }

  event.preventDefault();
  isClosingServer = true;
  closePlaygroundServer()
    .catch((error) => {
      console.warn('Failed to close playground server:', error);
    })
    .finally(() => {
      app.quit();
    });
});

app.on('window-all-closed', () => {
  app.quit();
});
