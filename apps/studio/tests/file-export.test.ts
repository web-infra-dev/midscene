import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFileExportHandlers } from '../src/main/file-export';
import { IPC_CHANNELS } from '../src/shared/electron-contract';

let directory: string;
function setup() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const frame = { url: 'file:///studio/index.html' };
  const contents = Object.assign(new EventEmitter(), { mainFrame: frame });
  const window = { webContents: contents, isDestroyed: () => false };
  const dialog = { showSaveDialog: vi.fn() };
  registerFileExportHandlers({
    ipcMain: {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    },
    dialog,
    getWindow: () => window as any,
    getDownloadsPath: () => directory,
    isTrustedUrl: (url) => url === 'file:///studio/index.html',
  });
  const event = {
    sender: contents,
    senderFrame: frame,
  } as unknown as IpcMainInvokeEvent;
  const invoke = (
    channel: keyof typeof IPC_CHANNELS,
    arg?: unknown,
    sender = event,
  ) => handlers.get(IPC_CHANNELS[channel])!(sender, arg);
  return { invoke, dialog, contents, event };
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'studio-export-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('native file export authorization', () => {
  it('rejects arbitrary writes, cancellation, and changes to the approved path', async () => {
    const { invoke, dialog } = setup();
    const selected = path.join(directory, 'selected.txt');
    const other = path.join(directory, 'other.txt');
    await writeFile(other, 'unchanged');
    await expect(
      invoke('writeFile', { path: other, content: 'attack' }),
    ).rejects.toThrow('Choose a save');
    dialog.showSaveDialog.mockResolvedValue({ canceled: true });
    expect(await invoke('chooseFileSavePath')).toBeNull();
    await expect(
      invoke('writeFile', { path: selected, content: 'attack' }),
    ).rejects.toThrow('Choose a save');
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selected,
    });
    expect(await invoke('chooseFileSavePath')).toBe(selected);
    await expect(
      invoke('writeFile', { path: other, content: 'attack' }),
    ).rejects.toThrow('Choose a save');
    expect(await readFile(other, 'utf-8')).toBe('unchanged');
  });

  it.each(['file', 'report'] as const)(
    'writes an approved %s only once, including concurrent requests',
    async (kind) => {
      const { invoke, dialog } = setup();
      const selected = path.join(
        directory,
        kind === 'report' ? 'report.html' : 'export.zip',
      );
      dialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: selected,
      });
      await invoke(
        kind === 'report' ? 'chooseReportSavePath' : 'chooseFileSavePath',
      );
      const request =
        kind === 'report'
          ? { path: selected, content: '<html>report</html>' }
          : {
              path: selected,
              content: Buffer.from('binary data').toString('base64'),
              encoding: 'base64',
            };
      const channel = kind === 'report' ? 'writeReportFile' : 'writeFile';
      const first = invoke(channel, request);
      await expect(invoke(channel, request)).rejects.toThrow('Choose a save');
      await first;
      expect(await readFile(selected, 'utf-8')).toBe(
        kind === 'report' ? request.content : 'binary data',
      );
    },
  );

  it('does not share approval between the report and generic write channels', async () => {
    const { invoke, dialog } = setup();
    const selected = path.join(directory, 'report.html');
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selected,
    });
    await invoke('chooseReportSavePath');
    await expect(
      invoke('writeFile', { path: selected, content: 'attack' }),
    ).rejects.toThrow('Choose a save');
  });

  it('rejects other windows and subframes', async () => {
    const { invoke, event } = setup();
    await expect(
      invoke('chooseFileSavePath', undefined, {
        ...event,
        senderFrame: { url: 'file:///studio/index.html' },
      } as any),
    ).rejects.toThrow('main page');
    await expect(
      invoke('writeFile', { path: '/tmp/attack', content: 'attack' }, {
        ...event,
        sender: {},
      } as any),
    ).rejects.toThrow('main page');
  });

  it('invalidates approval on reload and rejects a dialog completed after navigation', async () => {
    const { invoke, dialog, contents } = setup();
    const selected = path.join(directory, 'export.txt');
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selected,
    });
    await invoke('chooseFileSavePath');
    contents.emit('did-start-navigation', {
      isMainFrame: true,
      isSameDocument: false,
    });
    await expect(
      invoke('writeFile', { path: selected, content: 'attack' }),
    ).rejects.toThrow('Choose a save');
    let finish!: (result: any) => void;
    dialog.showSaveDialog.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const choice = invoke('chooseFileSavePath');
    contents.emit('did-start-navigation', {
      isMainFrame: true,
      isSameDocument: false,
    });
    finish({ canceled: false, filePath: selected });
    await expect(choice).rejects.toThrow('page changed');
  });

  it('replaces an approved symlink without overwriting its target', async () => {
    const { invoke, dialog } = setup();
    const selected = path.join(directory, 'selected.txt');
    const other = path.join(directory, 'private.txt');
    await writeFile(other, 'private');
    await symlink(other, selected);
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selected,
    });
    await invoke('chooseFileSavePath');
    await invoke('writeFile', { path: selected, content: 'exported' });
    expect(await readFile(other, 'utf-8')).toBe('private');
    expect(await readFile(selected, 'utf-8')).toBe('exported');
  });

  it('rejects path segments in renderer-supplied extensions', async () => {
    const { invoke, dialog } = setup();
    await expect(
      invoke('chooseFileSavePath', {
        filters: [{ name: 'bad', extensions: ['../../other'] }],
      }),
    ).rejects.toThrow('extension');
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  });
  it('rejects an untrusted document even in the original main frame', async () => {
    const { invoke, event } = setup();
    Object.assign(event.senderFrame!, { url: 'https://evil.test' });
    await expect(invoke('chooseFileSavePath')).rejects.toThrow('main page');
  });

  it('rejects a parent symlink redirected after approval', async () => {
    const { invoke, dialog } = setup();
    const original = path.join(directory, 'original');
    const other = path.join(directory, 'other');
    const alias = path.join(directory, 'alias');
    await mkdir(original);
    await mkdir(other);
    await symlink(original, alias);
    const selected = path.join(alias, 'export.txt');
    await writeFile(path.join(other, 'export.txt'), 'unchanged');
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selected,
    });
    await invoke('chooseFileSavePath');
    await unlink(alias);
    await symlink(other, alias);
    await expect(
      invoke('writeFile', { path: selected, content: 'attack' }),
    ).rejects.toThrow('destination changed');
    expect(await readFile(path.join(other, 'export.txt'), 'utf-8')).toBe(
      'unchanged',
    );
  });

  it('uses the exact approved filename and requires a new dialog after a failed write', async () => {
    const { invoke, dialog } = setup();
    const selected = path.join(directory, 'report-without-suffix');
    await writeFile(selected, 'old report');
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selected,
    });
    expect(await invoke('chooseReportSavePath')).toBe(selected);
    await expect(
      invoke('writeReportFile', {
        path: `${selected}.html`,
        content: 'attack',
      }),
    ).rejects.toThrow('Choose a save');
    await invoke('writeReportFile', { path: selected, content: 'new report' });
    expect(await readFile(selected, 'utf-8')).toBe('new report');

    const folder = path.join(directory, 'folder');
    await mkdir(folder);
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: folder,
    });
    await invoke('chooseFileSavePath');
    await expect(
      invoke('writeFile', {
        path: folder,
        content: 'cannot replace directory',
      }),
    ).rejects.toThrow();
    await expect(
      invoke('writeFile', { path: folder, content: 'retry' }),
    ).rejects.toThrow('Choose a save');
  });
});
