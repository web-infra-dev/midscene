/** @vitest-environment jsdom */
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStudioRecorderMarkdownZipBase64,
  createStudioRecorderZipBase64,
  generateStudioRecorderMarkdown,
  saveStudioRecorderFile,
} from '../src/renderer/recorder/export';
import type { StudioRecordingSession } from '../src/renderer/recorder/types';
import type { ElectronShellApi } from '../src/shared/electron-contract';

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
      if (String(tagName) === 'a') {
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
    } satisfies Partial<ElectronShellApi> as unknown as ElectronShellApi;

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

  it('exports Markdown replay zip with screenshot files', async () => {
    const session: StudioRecordingSession = {
      id: 'session-1',
      name: 'Replay login',
      status: 'completed',
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [
        {
          type: 'click',
          platformId: 'web',
          actionType: 'Click',
          rawPayload: {},
          target: {
            platformId: 'web',
            label: 'Web',
            values: { url: 'https://example.com' },
          },
          pageInfo: { width: 1280, height: 720 },
          semantic: {
            source: 'recorderAI',
            status: 'ready',
            elementDescription: 'Login button',
            confidence: 'high',
            fallbackFrom: {
              source: 'aiDescribe',
              status: 'failed',
              error: 'aiDescribe verification failed.',
              aiDescribe: {
                verifyPrompt: true,
                verifyPassed: false,
                centerDistance: 1.41,
                annotatedScreenshotPath:
                  '/tmp/recorder-ai-describe-screenshots/verify-failed-annotated.png',
              },
            },
          },
          screenshotWithBox:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
          timestamp: 1,
          hashId: 'click-1',
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    };

    const zip = await JSZip.loadAsync(
      await createStudioRecorderMarkdownZipBase64(session),
      { base64: true },
    );
    const markdown = await zip.file('recording.md')?.async('string');
    const manifest = JSON.parse(
      (await zip.file('recording.manifest.json')?.async('string')) || '{}',
    );

    expect(markdown).toContain('# Replay login');
    expect(markdown).toContain('not AI-generated');
    expect(markdown).not.toContain('![');
    expect(markdown).not.toContain('./screenshots/');
    expect(manifest).toMatchObject({
      aiGenerated: false,
      markdownSource: 'local-fallback',
      descriptionSourceCounts: {
        recorderAI: 1,
      },
      events: [
        {
          hashId: 'click-1',
          type: 'click',
          semantic: {
            source: 'recorderAI',
            status: 'ready',
            confidence: 'high',
            fallbackFrom: {
              source: 'aiDescribe',
              status: 'failed',
              error: 'aiDescribe verification failed.',
              aiDescribe: {
                verifyPassed: false,
                centerDistance: 1.41,
                annotatedScreenshotPath:
                  '/tmp/recorder-ai-describe-screenshots/verify-failed-annotated.png',
              },
            },
          },
        },
      ],
    });
    expect(zip.file('screenshots/event-001-click.png')).toBeTruthy();
  });

  it('includes Markdown replay files with screenshots in export-all zip', async () => {
    const session: StudioRecordingSession = {
      id: 'session-1',
      name: 'Replay login',
      status: 'completed',
      target: {
        platformId: 'web',
        label: 'Web',
        values: { url: 'https://example.com' },
      },
      events: [
        {
          type: 'navigation',
          platformId: 'web',
          actionType: 'Navigate',
          rawPayload: {},
          target: {
            platformId: 'web',
            label: 'Web',
            values: { url: 'https://example.com' },
          },
          pageInfo: { width: 1280, height: 720 },
          screenshotAfter:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
          timestamp: 1,
          hashId: 'nav-1',
          url: 'https://example.com',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            confidence: 'high',
          },
        },
      ],
      generatedCode: {
        markdown: '# Replay login\n\n## Steps\n1. Open page\n',
      },
      createdAt: 1,
      updatedAt: 2,
    };

    const zip = await JSZip.loadAsync(
      await createStudioRecorderZipBase64([session]),
      { base64: true },
    );
    const markdownFileName = 'markdown/replay-login-session-1.md';
    const markdown = await zip.file(markdownFileName)?.async('string');
    const manifest = JSON.parse(
      (await zip
        .file('markdown/replay-login-session-1.manifest.json')
        ?.async('string')) || '{}',
    );

    expect(markdown).toBe('# Replay login\n\n## Steps\n1. Open page\n');
    expect(manifest).toMatchObject({
      aiGenerated: true,
      markdownSource: 'ai',
      descriptionSourceCounts: {
        heuristic: 1,
      },
      events: [
        {
          hashId: 'nav-1',
          type: 'navigation',
          semantic: {
            source: 'heuristic',
            status: 'ready',
            confidence: 'high',
          },
        },
      ],
    });
    expect(
      zip.file('markdown/screenshots/event-001-navigation.png'),
    ).toBeTruthy();
  });

  it('escapes Markdown table cell content in recording summaries', () => {
    const markdown = generateStudioRecorderMarkdown([
      {
        id: 'session-1',
        name: 'Replay login',
        status: 'completed',
        target: {
          platformId: 'web',
          label: 'Web',
          values: { url: 'https://example.com' },
        },
        events: [
          {
            type: 'click',
            platformId: 'web',
            actionType: 'Click',
            rawPayload: {},
            target: {
              platformId: 'web',
              label: 'Web',
              values: { url: 'https://example.com' },
            },
            pageInfo: { width: 1280, height: 720 },
            semantic: {
              source: 'aiDescribe',
              status: 'ready',
              elementDescription: 'Path C:\\temp | confirm\nnext step',
            },
            timestamp: 1,
            hashId: 'click-1',
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    expect(markdown).toContain(
      '| 1 | click | Path C:\\\\temp \\| confirm<br>next step |',
    );
  });
});
