import { describe, expect, it, vi } from 'vitest';
import { getExecutionMarkdownView } from './markdown-view';

describe('getExecutionMarkdownView', () => {
  it('returns empty when execution is missing', () => {
    expect(
      getExecutionMarkdownView(undefined, () => ({
        markdown: '# report',
        attachments: [],
      })),
    ).toEqual({ status: 'empty' });
  });

  it('returns markdown when generation succeeds', () => {
    const result = getExecutionMarkdownView(
      { id: 'execution' } as never,
      () =>
        ({
          markdown: '# report',
          attachments: [],
        }) as never,
    );

    expect(result).toEqual({
      status: 'ready',
      markdown: '# report',
      attachments: [],
    });
  });

  it('returns the error message and warns when generation fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = getExecutionMarkdownView(
      { id: 'execution' } as never,
      () => {
        throw new Error('boom');
      },
    );

    expect(result).toEqual({
      status: 'error',
      errorMessage: 'boom',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to render markdown view',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
