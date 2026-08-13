/** @vitest-environment jsdom */
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chooseBrowserRecorderArchiveFile,
  createStudioRecorderArchivePlan,
  createStudioRecorderDeterministicDescription,
  createStudioRecorderMarkdownArchivePlan,
  createStudioRecorderMarkdownZipBase64,
  createStudioRecorderSessionFacts,
  createStudioRecorderZipBase64,
  generateStudioRecorderMarkdown,
  getStudioRecorderArchiveFileName,
  materializeStudioRecorderSessionScreenshots,
  saveStudioRecorderArchive,
  saveStudioRecorderFile,
} from '../src/renderer/recorder/export';
import type { StudioRecordingSession } from '../src/renderer/recorder/types';
import type { ElectronShellApi } from '../src/shared/electron-contract';

describe('studio recorder export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    (window as Window & { electronShell?: unknown }).electronShell = undefined;
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker =
      undefined;
  });

  it('uses a timestamped filename for recorder ZIP exports', () => {
    expect(getStudioRecorderArchiveFileName(1_786_609_529_578)).toBe(
      'midscene-studio-recordings-1786609529578.zip',
    );
  });

  it('materializes screenshot assets only in the export copy', async () => {
    const session: StudioRecordingSession = {
      id: 'session-assets',
      name: 'Asset-backed recording',
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
          screenshotAsset: {
            id: 'screenshot-1',
            mimeType: 'image/png',
            bytes: 42,
          },
          timestamp: 1,
          hashId: 'click-asset-1',
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    };
    const loadScreenshot = vi.fn(async () => 'data:image/png;base64,asset');

    const exportSession = await materializeStudioRecorderSessionScreenshots(
      session,
      loadScreenshot,
    );

    expect(loadScreenshot).toHaveBeenCalledWith('screenshot-1');
    expect(session.events[0].screenshotWithBox).toBeUndefined();
    expect(exportSession.events[0]).toMatchObject({
      screenshotWithBox: 'data:image/png;base64,asset',
    });
    expect(exportSession.events[0].screenshotAsset).toBeUndefined();
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

  it('does not open a browser picker when Electron owns archive export', async () => {
    const showSaveFilePicker = vi.fn();
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker =
      showSaveFilePicker;
    (window as Window & { electronShell?: unknown }).electronShell = {
      chooseFileSavePath: vi.fn(),
      writeFile: vi.fn(),
    } satisfies Partial<ElectronShellApi>;

    await expect(
      chooseBrowserRecorderArchiveFile('recording.zip'),
    ).resolves.toBeUndefined();
    expect(showSaveFilePicker).not.toHaveBeenCalled();
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
                verifyPrompt: false,
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

  it('chooses a save path before streaming asset refs through Electron', async () => {
    const session: StudioRecordingSession = {
      id: 'session-stream',
      name: 'Stream replay',
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
          screenshotAsset: {
            id: 'asset-stream-1',
            mimeType: 'image/jpeg',
            bytes: 128,
          },
          timestamp: 1,
          hashId: 'click-stream-1',
        },
      ],
      generatedCode: { markdown: '# Stream replay\n' },
      createdAt: 1,
      updatedAt: 2,
    };
    const order: string[] = [];
    const fallback = vi.fn(async () => {
      order.push('fallback');
      return 'unused';
    });
    const streamRecorderArchive = vi.fn(
      async (
        request: Parameters<ElectronShellApi['streamRecorderArchive']>[0],
      ) => {
        order.push('stream');
        expect(request.assetEntries).toEqual([
          expect.objectContaining({
            archivePath: 'screenshots/event-001-click.jpg',
            assetId: 'asset-stream-1',
          }),
        ]);
        return { path: request.path, bytesWritten: 256 };
      },
    );
    (window as Window & { electronShell?: unknown }).electronShell = {
      chooseFileSavePath: vi.fn(async () => {
        order.push('choose');
        return '/tmp/stream-replay.zip';
      }),
      streamRecorderArchive,
      onRecorderArchiveProgress: vi.fn(() => () => undefined),
      writeFile: vi.fn(),
    } satisfies Partial<ElectronShellApi> as unknown as ElectronShellApi;

    const allSessionsPlan = createStudioRecorderArchivePlan([session]);
    expect(allSessionsPlan.textEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          archivePath: 'markdown/stream-replay-session-stream/recording.md',
        }),
      ]),
    );
    expect(allSessionsPlan.assetEntries).toEqual([
      expect.objectContaining({
        archivePath:
          'markdown/stream-replay-session-stream/screenshots/event-001-click.jpg',
      }),
    ]);

    await saveStudioRecorderArchive({
      title: 'Export Recorder Markdown Replay',
      defaultFileName: 'stream-replay.zip',
      plan: createStudioRecorderMarkdownArchivePlan(session),
      createFallbackContent: fallback,
    });

    expect(order).toEqual(['choose', 'stream']);
    expect(fallback).not.toHaveBeenCalled();
    expect(streamRecorderArchive).toHaveBeenCalledTimes(1);
  });

  it('streams a browser ZIP to the selected file without materializing asset data URLs', async () => {
    const assetBytes = new TextEncoder().encode('already-compressed-png');
    const archiveChunks: Uint8Array[] = [];
    const write = vi.fn(async (data: Uint8Array) => {
      archiveChunks.push(data.slice());
    });
    const close = vi.fn(async () => undefined);
    const abort = vi.fn(async () => undefined);
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: vi.fn(async () => ({ write, close, abort })),
    }));
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: showSaveFilePicker,
    });
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: assetBytes.slice(0, 7),
      })
      .mockResolvedValueOnce({
        done: false,
        value: assetBytes.slice(7),
      })
      .mockResolvedValueOnce({ done: true });
    const fetchAsset = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => ({ read }) },
    }));
    vi.stubGlobal('fetch', fetchAsset);
    const fallback = vi.fn(async () => 'unused');
    const loadAsset = vi.fn(async () => null);
    const onProgress = vi.fn();

    await saveStudioRecorderArchive({
      title: 'Export Recorder Markdown Replay',
      defaultFileName: 'browser-stream.zip',
      plan: {
        textEntries: [
          { archivePath: 'recording.md', content: '# Browser stream' },
        ],
        assetEntries: [
          {
            archivePath: 'screenshots/event-001-click.png',
            assetId: 'asset-browser-stream',
            mimeType: 'image/png',
            bytes: assetBytes.byteLength,
          },
        ],
      },
      createFallbackContent: fallback,
      getAssetUrl: (assetId) => `/recorder/assets/${assetId}`,
      loadAsset,
      onProgress,
    });

    const archiveLength = archiveChunks.reduce(
      (total, chunk) => total + chunk.byteLength,
      0,
    );
    const archiveBytes = new Uint8Array(archiveLength);
    let offset = 0;
    for (const chunk of archiveChunks) {
      archiveBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const zip = await JSZip.loadAsync(archiveBytes);
    await expect(zip.file('recording.md')?.async('string')).resolves.toBe(
      '# Browser stream',
    );
    const archivedAsset = await zip
      .file('screenshots/event-001-click.png')
      ?.async('uint8array');
    expect(Array.from(archivedAsset || [])).toEqual(Array.from(assetBytes));
    expect(showSaveFilePicker).toHaveBeenCalledBefore(fetchAsset);
    expect(fetchAsset).toHaveBeenCalledWith(
      '/recorder/assets/asset-browser-stream',
      { signal: undefined },
    );
    expect(loadAsset).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(abort).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'completed',
        processedBytes:
          new TextEncoder().encode('# Browser stream').byteLength +
          assetBytes.byteLength,
        elapsedMs: expect.any(Number),
      }),
    );
  });

  it('uses the same full-timeline visual selection for model materialization and archive export', async () => {
    const target = {
      platformId: 'web' as const,
      label: 'Web',
      values: { url: 'https://example.com' },
    };
    const session: StudioRecordingSession = {
      id: 'session-selection',
      name: 'Selection consistency',
      status: 'completed',
      target,
      events: Array.from({ length: 25 }, (_, index) => ({
        type: 'click' as const,
        platformId: 'web' as const,
        actionType: 'Click',
        rawPayload: {},
        target,
        pageInfo: { width: 1280, height: 720 },
        screenshotAsset: {
          id: `asset-${index + 1}`,
          mimeType: 'image/png',
          bytes: index + 1,
        },
        timestamp: index + 1,
        hashId: `click-${index + 1}`,
        eventId: `event-${index + 1}`,
        sequence: index + 1,
      })),
      createdAt: 1,
      updatedAt: 2,
    };
    const loadAsset = vi.fn(
      async (assetId: string) => `data:image/png;base64,${assetId}`,
    );

    const materialized = await materializeStudioRecorderSessionScreenshots(
      session,
      loadAsset,
    );
    const materializedAssetIds = materialized.events
      .map((event) => event.screenshotWithBox?.split(',')[1])
      .filter(Boolean);
    const plan = createStudioRecorderMarkdownArchivePlan(session);
    const archivedAssetIds = plan.assetEntries.map((entry) => entry.assetId);

    expect(materializedAssetIds).toEqual(archivedAssetIds);
    expect(archivedAssetIds).toHaveLength(20);
    expect(archivedAssetIds[0]).toBe('asset-1');
    expect(archivedAssetIds.at(-1)).toBe('asset-25');
    expect(loadAsset).toHaveBeenCalledTimes(20);

    const manifestEntry = plan.textEntries.find(
      (entry) => entry.archivePath === 'recording.manifest.json',
    );
    const manifest = JSON.parse(manifestEntry?.content || '{}');
    expect(manifest.visualEvidence).toEqual({
      selectionLimit: 20,
      candidateCount: 25,
      selectedCount: 20,
      omittedCount: 5,
      unavailableCount: 0,
      omissionReasonCounts: { 'selection-limit': 5 },
      selectedEventIndexes: expect.arrayContaining([1, 25]),
      omittedEventIndexes: expect.any(Array),
      unavailableEventIndexes: [],
    });
    expect(manifest.visualEvidence.omittedEventIndexes).toHaveLength(5);
    for (const eventIndex of manifest.visualEvidence.omittedEventIndexes) {
      expect(manifest.events[eventIndex - 1].screenshotSelection).toEqual({
        status: 'omitted',
        reason: 'selection-limit',
      });
    }
  });

  it('distinguishes deduplicated visual evidence from selection-limit omissions', () => {
    const target = {
      platformId: 'web' as const,
      label: 'Web',
      values: { url: 'https://example.com' },
    };
    const session: StudioRecordingSession = {
      id: 'session-duplicate-evidence',
      name: 'Duplicate evidence',
      status: 'completed',
      target,
      events: [1, 2].map((sequence) => ({
        type: 'click' as const,
        platformId: 'web' as const,
        actionType: 'Click',
        rawPayload: {},
        target,
        pageInfo: { width: 1280, height: 720 },
        screenshotAsset: {
          id: 'shared-asset',
          mimeType: 'image/png',
          bytes: 12,
        },
        timestamp: sequence,
        hashId: `duplicate-${sequence}`,
        eventId: `duplicate-${sequence}`,
        sequence,
      })),
      createdAt: 1,
      updatedAt: 2,
    };

    const plan = createStudioRecorderMarkdownArchivePlan(session);
    const manifestEntry = plan.textEntries.find(
      (entry) => entry.archivePath === 'recording.manifest.json',
    );
    const manifest = JSON.parse(manifestEntry?.content || '{}');

    expect(plan.assetEntries).toHaveLength(1);
    expect(manifest.events[0].screenshotSelection).toEqual({
      status: 'selected',
    });
    expect(manifest.events[1].screenshotSelection).toEqual({
      status: 'omitted',
      reason: 'selection-policy',
    });
    expect(manifest.visualEvidence).toMatchObject({
      candidateCount: 2,
      selectedCount: 1,
      omittedCount: 1,
      unavailableCount: 0,
      omissionReasonCounts: { 'selection-policy': 1 },
      selectedEventIndexes: [1],
      omittedEventIndexes: [2],
      unavailableEventIndexes: [],
    });
  });

  it('records exact sequence facts and keeps AI narrative separate in the manifest', () => {
    const target = {
      platformId: 'web' as const,
      label: 'Web',
      values: { url: 'https://example.com' },
    };
    const makeEvent = (
      hashId: string,
      sequence: number,
      options: { type?: 'click' | 'navigation'; parentEventId?: string } = {},
    ) => ({
      type: options.type || ('click' as const),
      platformId: 'web' as const,
      actionType: options.type === 'navigation' ? 'Navigate' : 'Click',
      rawPayload: {},
      target,
      pageInfo: { width: 1280, height: 720 },
      timestamp: sequence,
      hashId,
      eventId: hashId,
      sequence,
      parentEventId: options.parentEventId,
    });
    const session: StudioRecordingSession = {
      id: 'session-facts',
      name: 'Deterministic facts',
      status: 'completed',
      target,
      metadataDescription: 'A fluent but non-canonical AI narrative.',
      events: [
        {
          ...makeEvent('event-1', 1),
          captureStatus: 'ready',
          frame: {
            token: 'frame-1',
            capturedAt: 10,
            source: 'shared-frame-stream',
            offsetMs: -2,
          },
          screenshotAsset: {
            id: 'session-facts-deadbeef',
            mimeType: 'image/png',
            bytes: 12,
            sha256: 'deadbeef',
          },
        },
        makeEvent('event-1-nav', 1, {
          type: 'navigation',
          parentEventId: 'event-1',
        }),
        makeEvent('event-2-a', 2),
        makeEvent('event-2-b', 2),
        makeEvent('event-4', 4),
      ],
      createdAt: 1,
      updatedAt: 2,
    };

    expect(createStudioRecorderSessionFacts(session)).toEqual({
      totalEvents: 5,
      actionCount: 3,
      eventTypeCounts: { click: 4, navigation: 1 },
      actionSequence: {
        first: 1,
        last: 4,
        uniqueCount: 3,
        missing: [3],
        duplicates: [2],
      },
    });
    const plan = createStudioRecorderMarkdownArchivePlan(session);
    const manifestEntry = plan.textEntries.find(
      (entry) => entry.archivePath === 'recording.manifest.json',
    );
    const manifest = JSON.parse(manifestEntry?.content || '{}');
    expect(manifest).toMatchObject({
      facts: createStudioRecorderSessionFacts(session),
      deterministicDescription:
        createStudioRecorderDeterministicDescription(session),
      aiNarrative: 'A fluent but non-canonical AI narrative.',
    });
    expect(manifest.events).toHaveLength(5);
    expect(manifest.events[0]).toMatchObject({
      index: 1,
      eventId: 'event-1',
      sequence: 1,
      capture: { status: 'ready' },
      frame: expect.objectContaining({ token: 'frame-1' }),
      screenshot: {
        path: 'screenshots/event-001-click.png',
        assetId: 'session-facts-deadbeef',
        mimeType: 'image/png',
        bytes: 12,
        sha256: 'deadbeef',
      },
      screenshotSelection: { status: 'selected' },
    });
    expect(manifest.events[1]).toMatchObject({
      index: 2,
      parentEventId: 'event-1',
      type: 'navigation',
      screenshotSelection: { status: 'unavailable' },
    });
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
          screenshotAfter: 'data:image/png;base64,c2NyZWVuc2hvdA==',
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
    const markdownFileName = 'markdown/replay-login-session-1/recording.md';
    const markdown = await zip.file(markdownFileName)?.async('string');
    const manifest = JSON.parse(
      (await zip
        .file('markdown/replay-login-session-1/recording.manifest.json')
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
          screenshot: {
            bytes: 10,
          },
          semantic: {
            source: 'heuristic',
            status: 'ready',
            confidence: 'high',
          },
        },
      ],
    });
    expect(
      zip.file(
        'markdown/replay-login-session-1/screenshots/event-001-navigation.png',
      ),
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
