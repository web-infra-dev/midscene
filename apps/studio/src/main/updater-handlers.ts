import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import { IPC_CHANNELS } from '@shared/electron-contract';
import { app, ipcMain } from 'electron';
import type { UpdateStatus } from '../shared/updater-contract';
import { type StudioUpdater, autoUpdater } from './updater';

const debugUpdaterHandlers = getDebug('studio:updater-handlers', {
  console: true,
});

const UPDATER_CACHE_DIR_NAME = 'midscene-studio-updater';

interface MacUpdateScriptOptions {
  appPath: string;
  execName: string;
  zipPath: string;
  tempDir: string;
  scriptPath: string;
  logPath: string;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildMacUpdateScript({
  appPath,
  execName,
  zipPath,
  tempDir,
  scriptPath,
  logPath,
}: MacUpdateScriptOptions): string {
  return `#!/bin/bash
set -u

APP_PATH=${shellQuote(appPath)}
APP_CONTENTS_PATH="$APP_PATH/Contents/"
EXEC_NAME=${shellQuote(execName)}
ZIP_PATH=${shellQuote(zipPath)}
TEMP_DIR=${shellQuote(tempDir)}
SCRIPT_PATH=${shellQuote(scriptPath)}
LOG_PATH=${shellQuote(logPath)}

exec > "$LOG_PATH" 2>&1
echo "Update script started at $(date)"
echo "appPath=$APP_PATH"
echo "zipPath=$ZIP_PATH"

# Poll until every helper from the old bundle (renderer, GPU, plugin)
# exits — matching just Contents/MacOS misses the ones under Frameworks.
for i in $(/usr/bin/seq 1 120); do
  if ! /usr/bin/pgrep -f -- "$APP_CONTENTS_PATH" > /dev/null 2>&1; then
    echo "All app processes exited after $i polls"
    break
  fi
  /bin/sleep 0.5
done

if /usr/bin/pgrep -f -- "$APP_CONTENTS_PATH" > /dev/null 2>&1; then
  echo "ERROR: app processes are still running; aborting update"
  /usr/bin/pgrep -fl -- "$APP_CONTENTS_PATH" || true
  /usr/bin/open "$APP_PATH"
  exit 1
fi

/bin/rm -rf "$TEMP_DIR"
/bin/mkdir -p "$TEMP_DIR"

echo "Extracting zip..."
/usr/bin/ditto -x -k "$ZIP_PATH" "$TEMP_DIR"
echo "Extract exit code: $?"

APP_BUNDLE=$(/usr/bin/find "$TEMP_DIR" -maxdepth 2 -name "*.app" -print -quit)
echo "Found app bundle: $APP_BUNDLE"

if [ -z "$APP_BUNDLE" ]; then
  echo "ERROR: No .app found in extracted zip"
  /bin/rm -rf "$TEMP_DIR"
  /bin/rm -f "$SCRIPT_PATH"
  /usr/bin/open "$APP_PATH"
  exit 1
fi

# BSD mv on macOS will move source INTO target if target still exists as a
# directory — that produces a nested .app/.app bundle. Verify removal first.
echo "Replacing app bundle..."
/bin/rm -rf "$APP_PATH"
if [ -e "$APP_PATH" ]; then
  echo "ERROR: failed to remove old bundle at $APP_PATH; aborting to avoid nested install"
  /usr/bin/find "$APP_PATH" -maxdepth 2 -print
  /bin/rm -rf "$TEMP_DIR"
  /bin/rm -f "$SCRIPT_PATH"
  exit 1
fi
/bin/mv "$APP_BUNDLE" "$APP_PATH"
MV_EXIT=$?
echo "Move exit code: $MV_EXIT"
if [ $MV_EXIT -ne 0 ] || [ ! -e "$APP_PATH/Contents/MacOS" ]; then
  echo "ERROR: mv did not produce a valid bundle, falling back to ditto"
  /bin/rm -rf "$APP_PATH"
  /usr/bin/ditto "$APP_BUNDLE" "$APP_PATH"
  echo "Ditto exit code: $?"
fi

/usr/bin/xattr -cr "$APP_PATH" 2>/dev/null

/bin/rm -rf "$TEMP_DIR"
/bin/sleep 1

echo "Launching app..."
nohup "$APP_PATH/Contents/MacOS/$EXEC_NAME" > /dev/null 2>&1 &
LAUNCH_PID=$!
echo "Launched with PID: $LAUNCH_PID"
/bin/sleep 2
if kill -0 $LAUNCH_PID 2>/dev/null; then
  echo "App is running"
else
  echo "App exited, trying open as fallback..."
  /usr/bin/open "$APP_PATH"
  echo "Open exit code: $?"
fi

/bin/rm -f "$SCRIPT_PATH"
echo "Update complete at $(date)"
`;
}

export async function findDownloadedMacUpdateZip(
  updater: StudioUpdater,
): Promise<string | null> {
  const downloaded = updater.getDownloadedFilePath();
  if (downloaded) {
    try {
      await fs.promises.access(downloaded, fs.constants.R_OK);
      return downloaded;
    } catch {
      /* fall through */
    }
  }

  const appName = app.getName();
  const home = app.getPath('home');
  const cacheDirs = [
    path.join(home, 'Library', 'Caches', UPDATER_CACHE_DIR_NAME),
    path.join(home, 'Library', 'Caches', `${appName}-updater`),
    path.join(home, 'Library', 'Caches', appName),
  ];

  for (const cacheDir of cacheDirs) {
    const pendingDir = path.join(cacheDir, 'pending');
    try {
      const files = await fs.promises.readdir(pendingDir);
      const match = files.find((f) => f.endsWith('.zip'));
      if (match) return path.join(pendingDir, match);
    } catch {
      /* ignore */
    }
    const candidate = path.join(cacheDir, 'update.zip');
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      /* ignore */
    }
  }

  return null;
}

async function installMacUpdate(updater: StudioUpdater): Promise<void> {
  if (!app.isPackaged) return;
  const zipPath = await findDownloadedMacUpdateZip(updater);
  if (!zipPath) {
    console.error('[updater:install] No downloaded zip found');
    return;
  }

  // process.resourcesPath => .../Midscene Studio.app/Contents/Resources
  // Step up two levels to reach the .app bundle root so the script can
  // replace it atomically.
  const appPath = path.resolve(process.resourcesPath, '..', '..');
  const execName = path.basename(process.execPath);
  const tempDir = path.join(app.getPath('temp'), 'midscene-studio-update');
  const scriptPath = path.join(
    app.getPath('temp'),
    'midscene-studio-update.sh',
  );
  const logPath = path.join(app.getPath('temp'), 'midscene-studio-update.log');

  const script = buildMacUpdateScript({
    appPath,
    execName,
    zipPath,
    tempDir,
    scriptPath,
    logPath,
  });
  await fs.promises.writeFile(scriptPath, script, { mode: 0o755 });

  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.unref();

  setTimeout(() => app.quit(), 500);
}

function normalizeReleaseNotes(releaseNotes: unknown): string | undefined {
  return typeof releaseNotes === 'string' ? releaseNotes : undefined;
}

export function resolveUpdaterCheckStatus(
  result: unknown,
  currentStatus: UpdateStatus,
  platform: NodeJS.Platform = process.platform,
): UpdateStatus {
  if (currentStatus.state !== 'checking') {
    return currentStatus;
  }

  const updateInfo = (result as { updateInfo?: unknown } | null)?.updateInfo;
  if (typeof updateInfo === 'object' && updateInfo !== null) {
    const version = (updateInfo as { version?: unknown }).version;
    if (typeof version === 'string' && version.length > 0) {
      return {
        state: 'available',
        version,
        releaseNotes: normalizeReleaseNotes(
          (updateInfo as { releaseNotes?: unknown }).releaseNotes,
        ),
        externalDownloadOnly: platform === 'win32' || platform === 'linux',
      };
    }
  }

  return { state: 'not-available' };
}

export function registerUpdaterHandlers(updater: StudioUpdater): void {
  ipcMain.handle(IPC_CHANNELS.updaterCheck, async () => {
    if (!app.isPackaged) return { state: 'not-available' };
    try {
      const result = await updater.checkUserInitiated();
      return resolveUpdaterCheckStatus(result, updater.getStatus());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const code = (error as { code?: string }).code;
      debugUpdaterHandlers(
        'updater.check.throw code=%s platform=%s/%s message=%s',
        code ?? 'unknown',
        process.platform,
        process.arch,
        error.message,
      );
      return { state: 'error', message: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updaterDownload, async () => {
    if (!app.isPackaged) return { success: false };
    try {
      await updater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.updaterInstall, async () => {
    if (process.platform === 'darwin') {
      try {
        await installMacUpdate(updater);
      } catch (err) {
        console.error('[updater:install] Manual update failed:', err);
        // Last-resort fallback if the manual script path blows up before
        // it can detach — quitAndInstall throws on Mac when
        // Squirrel.Mac's ShipIt hits EBADF, but it can still succeed when
        // the failure happened before we wrote the script.
        autoUpdater.quitAndInstall();
      }
      return;
    }

    autoUpdater.quitAndInstall();
  });

  ipcMain.handle(IPC_CHANNELS.updaterGetVersion, async () => app.getVersion());

  ipcMain.handle(IPC_CHANNELS.updaterGetStatus, () => updater.getStatus());
}
