import { describe, expect, it, vi } from 'vitest';
import {
  buildMarkdownArchiveFiles,
  buildMarkdownArchiveFilesForDownload,
  countPackageableMarkdownAttachments,
  getMarkdownAttachmentDisplayItems,
  getReportMarkdownView,
  markdownArchiveBaseName,
  markdownAttachmentPath,
} from './markdown-export';

describe('markdown-export helpers', () => {
  it('returns empty when report is missing', () => {
    expect(
      getReportMarkdownView(undefined, () => ({
        markdown: '',
        attachments: [],
      })),
    ).toEqual({
      status: 'empty',
    });
  });

  it('returns report markdown when generation succeeds', () => {
    const result = getReportMarkdownView(
      {
        groupName: 'report',
        sdkVersion: '1.0.0',
        modelBriefs: [],
        executions: [],
      },
      () => ({
        markdown: '# report',
        attachments: [],
      }),
    );

    expect(result).toEqual({
      status: 'ready',
      markdown: '# report',
      attachments: [],
    });
  });

  it('returns the error message and warns when report markdown generation fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = getReportMarkdownView(
      {
        groupName: 'report',
        sdkVersion: '1.0.0',
        modelBriefs: [],
        executions: [],
      },
      () => {
        throw new Error('boom');
      },
    );

    expect(result).toEqual({
      status: 'error',
      errorMessage: 'boom',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to render report markdown view',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('builds safe archive names from report group names', () => {
    expect(markdownArchiveBaseName({ groupName: 'Checkout flow #1' })).toBe(
      'Checkout-flow-1',
    );
    expect(markdownArchiveBaseName({ groupName: '***' })).toBe(
      'midscene-report',
    );
  });

  it('packages markdown and only in-memory screenshot attachments', () => {
    const files = buildMarkdownArchiveFiles('# report', [
      {
        id: 'inline',
        suggestedFileName: 'inline.png',
        executionIndex: 0,
        taskIndex: 0,
        base64Data: `data:image/png;base64,${btoa('image-bytes')}`,
      },
      {
        id: 'file-backed',
        suggestedFileName: 'file-backed.png',
        executionIndex: 0,
        taskIndex: 1,
      },
    ]);

    expect(Object.keys(files).sort()).toEqual([
      'report.md',
      'screenshots/inline.png',
    ]);
    expect(new TextDecoder().decode(files['report.md'])).toBe('# report');
    expect(new TextDecoder().decode(files['screenshots/inline.png'])).toBe(
      'image-bytes',
    );
  });

  it('builds display items from markdown attachment names and paths', () => {
    const items = getMarkdownAttachmentDisplayItems([
      {
        id: 'shot',
        suggestedFileName: 'execution-1-task-2-shot.png',
        executionIndex: 0,
        taskIndex: 1,
        base64Data: 'data:image/png;base64,AA==',
      },
    ]);

    expect(items).toEqual([
      {
        key: '0-1-shot-execution-1-task-2-shot.png-0',
        fileName: 'execution-1-task-2-shot.png',
        markdownPath: './screenshots/execution-1-task-2-shot.png',
        previewSrc: 'data:image/png;base64,AA==',
        executionIndex: 0,
        taskIndex: 1,
      },
    ]);
    expect(
      markdownAttachmentPath({
        suggestedFileName: items[0].fileName,
      }),
    ).toBe('./screenshots/execution-1-task-2-shot.png');
  });

  it('uses file paths for preview without treating them as packageable base64', () => {
    const attachment = {
      id: 'file-shot',
      suggestedFileName: 'execution-1-task-1-file-shot.png',
      executionIndex: 0,
      taskIndex: 0,
      base64Data: './screenshots/file-shot.png',
    };

    expect(getMarkdownAttachmentDisplayItems([attachment])[0]).toMatchObject({
      fileName: 'execution-1-task-1-file-shot.png',
      markdownPath: './screenshots/execution-1-task-1-file-shot.png',
      previewSrc: './screenshots/file-shot.png',
    });
    expect(countPackageableMarkdownAttachments([attachment])).toBe(0);
    expect(
      Object.keys(buildMarkdownArchiveFiles('# report', [attachment])),
    ).toEqual(['report.md']);
  });

  it('packages fetchable file-backed attachments under their markdown names', async () => {
    const fileBytes = new TextEncoder().encode('file-bytes');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => fileBytes.buffer,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await buildMarkdownArchiveFilesForDownload('# report', [
      {
        id: 'file-shot',
        suggestedFileName: 'execution-1-task-1-file-shot.png',
        executionIndex: 0,
        taskIndex: 0,
        base64Data: './screenshots/file-shot.png',
        sourceRef: {
          type: 'midscene_screenshot_ref',
          id: 'file-shot',
          capturedAt: 1710000000000,
          mimeType: 'image/png',
          storage: 'file',
          path: './screenshots/file-shot.png',
        },
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('./screenshots/file-shot.png');
    expect(Object.keys(result.files).sort()).toEqual([
      'report.md',
      'screenshots/execution-1-task-1-file-shot.png',
    ]);
    expect(
      new TextDecoder().decode(
        result.files['screenshots/execution-1-task-1-file-shot.png'],
      ),
    ).toBe('file-bytes');
    expect(result.packagedAttachmentCount).toBe(1);
    expect(result.missingAttachmentCount).toBe(0);

    vi.unstubAllGlobals();
  });

  it('counts packageable attachments by base64 availability', () => {
    expect(
      countPackageableMarkdownAttachments([
        {
          id: 'inline',
          suggestedFileName: 'inline.png',
          executionIndex: 0,
          taskIndex: 0,
          base64Data: 'data:image/png;base64,AA==',
        },
        {
          id: 'file-backed',
          suggestedFileName: 'file-backed.png',
          executionIndex: 0,
          taskIndex: 1,
        },
      ]),
    ).toBe(1);
  });
});
