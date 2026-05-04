import { type BrowserWindow, WebContentsView } from 'electron';

export interface WebPreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebViewSession {
  /** Stable id used as the session/device id in the playground UI. */
  id: string;
  /** The url that was loaded into the WebContentsView. */
  url: string;
  /** The Electron-side WebContents id; matches DevTools target ids. */
  webContentsId: number;
  /** Title most recently reported by the WebContents. */
  title: string;
}

export interface WebViewManager {
  /**
   * Create or recycle the single web session view. Loads `url` and resolves
   * once the page commits — even if the page never finishes loading, the
   * view is already attached and reachable via CDP.
   */
  openSession(url: string): Promise<WebViewSession>;
  /** Get the currently-open session, if any. */
  getSession(): WebViewSession | null;
  /** Resize/move the WebContentsView so it tracks the renderer preview slot. */
  setPreviewBounds(bounds: WebPreviewBounds): void;
  /** Hide the view by zeroing its bounds; keeps the underlying WebContents alive. */
  hidePreview(): void;
  /** Tear down the WebContentsView. */
  closeSession(): Promise<void>;
}

const HIDDEN_BOUNDS: WebPreviewBounds = { x: 0, y: 0, width: 0, height: 0 };

function roundBounds(bounds: WebPreviewBounds): WebPreviewBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

function isUsableUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createWebViewManager(options: {
  getMainWindow: () => BrowserWindow | null;
}): WebViewManager {
  let view: WebContentsView | null = null;
  let session: WebViewSession | null = null;

  const detachView = () => {
    if (!view) return;
    const mainWindow = options.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
    view = null;
  };

  return {
    async openSession(url) {
      if (!isUsableUrl(url)) {
        throw new Error(`Invalid web url: ${url}. Provide an http(s) URL.`);
      }
      const mainWindow = options.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Studio main window is not available');
      }

      if (!view) {
        view = new WebContentsView({
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        view.setBackgroundColor('#ffffff');
        mainWindow.contentView.addChildView(view);
        // Start hidden — renderer pushes real bounds once the slot mounts.
        view.setBounds(HIDDEN_BOUNDS);
      }

      const targetView = view;
      await targetView.webContents.loadURL(url);

      const webContentsId = targetView.webContents.id;
      session = {
        id: `web:${webContentsId}`,
        url,
        webContentsId,
        title: targetView.webContents.getTitle() || url,
      };

      targetView.webContents.on('page-title-updated', (_event, title) => {
        if (session && session.webContentsId === webContentsId) {
          session.title = title;
        }
      });
      targetView.webContents.on('destroyed', () => {
        if (session && session.webContentsId === webContentsId) {
          session = null;
        }
      });

      return session;
    },

    getSession() {
      return session;
    },

    setPreviewBounds(bounds) {
      if (!view || view.webContents.isDestroyed()) {
        return;
      }
      view.setBounds(roundBounds(bounds));
    },

    hidePreview() {
      if (!view || view.webContents.isDestroyed()) {
        return;
      }
      view.setBounds(HIDDEN_BOUNDS);
    },

    async closeSession() {
      detachView();
      session = null;
    },
  };
}
