/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveStudioRecorderFile } from '../src/renderer/recorder/export';

describe('studio recorder export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (window as Window & { electronShell?: unknown }).electronShell = undefined;
  });

  it('falls back to browser download when generic file IPC is unavailable', async () => {
    const click = vi.fn();
    const writeFile = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createObjectURL = vi.fn(() => 'blob:studio-recorder-export');
    const revokeObjectURL = vi.fn();

    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: click,
        });
      }
      return element;
    });

    (window as Window & { electronShell?: unknown }).electronShell = {
      chooseFileSavePath: vi.fn(async () => {
        throw new Error(
          "Error invoking remote method 'shell:choose-file-save-path': Error: No handler registered",
        );
      }),
      writeFile,
    };

    await saveStudioRecorderFile({
      title: 'Export Recorder JSON',
      defaultFileName: 'recording.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      content: '{"events":[]}',
    });

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
