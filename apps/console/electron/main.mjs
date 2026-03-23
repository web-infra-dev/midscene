import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, ipcMain } from 'electron';
import { createSessionManager } from './session-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.MIDSCENE_CONSOLE_RENDERER_URL;

let mainWindow = null;
let sessionManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#10131a',
    title: 'Midscene Console',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  await app.whenReady();

  sessionManager = createSessionManager(() => mainWindow);

  ipcMain.handle('midscene-console:get-platforms', async () => {
    return sessionManager.getPlatforms();
  });
  ipcMain.handle('midscene-console:list-sessions', async () => {
    return sessionManager.listSessions();
  });
  ipcMain.handle('midscene-console:create-session', async (_event, payload) => {
    return sessionManager.createSession(payload);
  });
  ipcMain.handle('midscene-console:stop-session', async (_event, sessionId) => {
    return sessionManager.stopSession(sessionId);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.on('window-all-closed', async () => {
  await sessionManager?.dispose?.();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await sessionManager?.dispose?.();
});

bootstrap();
