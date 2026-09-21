import { mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  WebContents,
  dialog as electronDialog,
} from 'electron';
import {
  type ChooseFileSavePathRequest,
  IPC_CHANNELS,
  type WriteFileRequest,
  type WriteReportFileRequest,
} from '../shared/electron-contract';

type ExportKind = 'report' | 'file';
type ExportState = {
  generation: number;
  grants: Map<string, { kind: ExportKind; parent: string }>;
};

/** Only native save dialogs can grant a single write to an exact destination. */
export function registerFileExportHandlers(options: {
  ipcMain: Pick<IpcMain, 'handle'>;
  dialog: Pick<typeof electronDialog, 'showSaveDialog'>;
  getWindow: () => BrowserWindow | null;
  getDownloadsPath: () => string;
  isTrustedUrl: (url: string) => boolean;
}) {
  const states = new WeakMap<WebContents, ExportState>();

  const getSender = (event: IpcMainInvokeEvent) => {
    const window = options.getWindow();
    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      !event.senderFrame ||
      event.senderFrame !== window.webContents.mainFrame ||
      !options.isTrustedUrl(event.senderFrame.url)
    ) {
      throw new Error('File export is only available to the Studio main page');
    }
    const existing = states.get(event.sender);
    if (existing) return { window, state: existing };
    const state: ExportState = { generation: 0, grants: new Map() };
    states.set(event.sender, state);
    const invalidate = () => {
      state.generation += 1;
      state.grants.clear();
    };
    event.sender.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) invalidate();
    });
    event.sender.on('render-process-gone', invalidate);
    event.sender.on('destroyed', invalidate);
    return { window, state };
  };

  const choose = async (
    event: IpcMainInvokeEvent,
    kind: ExportKind,
    request?: ChooseFileSavePathRequest,
  ) => {
    const { window, state } = getSender(event);
    const generation = state.generation;
    const defaultName =
      kind === 'report' ? 'midscene_report.html' : 'midscene_export.json';
    const filters =
      kind === 'report'
        ? [{ name: 'HTML Report', extensions: ['html'] }]
        : request?.filters?.length
          ? request.filters
          : [{ name: 'All Files', extensions: ['*'] }];
    // Extensions influence the final destination, so never allow path segments.
    for (const filter of filters) {
      if (
        !Array.isArray(filter.extensions) ||
        filter.extensions.some(
          (extension) =>
            typeof extension !== 'string' ||
            !/^(?:\*|[a-z0-9]+)$/i.test(extension),
        )
      )
        throw new Error('Invalid file export extension');
    }
    let defaultFileName = path.basename(
      request?.defaultFileName?.trim() || defaultName,
    );
    if (kind === 'report' && !defaultFileName.toLowerCase().endsWith('.html')) {
      defaultFileName += '.html';
    }
    const result = await options.dialog.showSaveDialog(window, {
      title:
        kind === 'report'
          ? 'Save Midscene Report'
          : request?.title || 'Save Midscene Export',
      defaultPath: path.join(options.getDownloadsPath(), defaultFileName),
      filters,
    });
    if (result.canceled || !result.filePath) return null;
    getSender(event);
    if (state.generation !== generation)
      throw new Error('Studio page changed during file export');
    // Use precisely what the native dialog approved; never append a path suffix
    // after confirmation (which could bypass its overwrite confirmation).
    const target = result.filePath;
    if (!path.isAbsolute(target))
      throw new Error('Save destination must be absolute');
    const parent = await realpath(path.dirname(target));
    if (state.generation !== generation)
      throw new Error('Studio page changed during file export');
    state.grants.set(target, { kind, parent });
    return target;
  };

  const save = async (
    event: IpcMainInvokeEvent,
    kind: ExportKind,
    request: WriteFileRequest | WriteReportFileRequest,
  ) => {
    const { state } = getSender(event);
    if (
      typeof request?.path !== 'string' ||
      typeof request?.content !== 'string'
    ) {
      throw new Error('File export requires a path and string content');
    }
    const encoding = 'encoding' in request ? request.encoding : undefined;
    if (encoding && encoding !== 'utf-8' && encoding !== 'base64') {
      throw new Error('Unsupported file export encoding');
    }
    const grant = state.grants.get(request.path);
    if (!grant || grant.kind !== kind)
      throw new Error('Choose a save destination before writing this file');
    // Consume before the first await, including failed writes and concurrent calls.
    state.grants.delete(request.path);
    const parent = await realpath(path.dirname(request.path));
    if (parent !== grant.parent)
      throw new Error('Save destination changed; choose it again');
    const target = path.join(parent, path.basename(request.path));
    const temporaryDirectory = await mkdtemp(
      path.join(parent, '.midscene-export-'),
    );
    try {
      const temporaryFile = path.join(temporaryDirectory, 'export');
      await writeFile(
        temporaryFile,
        encoding === 'base64'
          ? Buffer.from(request.content, 'base64')
          : request.content,
        { mode: 0o600 },
      );
      // Replacing the directory entry avoids following a destination symlink
      // or modifying another file through a hard link.
      await rename(temporaryFile, target);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  };

  options.ipcMain.handle(
    IPC_CHANNELS.chooseReportSavePath,
    (event, defaultFileName?: string) =>
      choose(event, 'report', { defaultFileName }),
  );
  options.ipcMain.handle(
    IPC_CHANNELS.chooseFileSavePath,
    (event, request?: ChooseFileSavePathRequest) =>
      choose(event, 'file', request),
  );
  options.ipcMain.handle(
    IPC_CHANNELS.writeReportFile,
    (event, request: WriteReportFileRequest) => save(event, 'report', request),
  );
  options.ipcMain.handle(
    IPC_CHANNELS.writeFile,
    (event, request: WriteFileRequest) => save(event, 'file', request),
  );
}
