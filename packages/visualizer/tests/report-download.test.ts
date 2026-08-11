import { describe, expect, it, rs } from '@rstest/core';
import {
  DEFAULT_REPORT_FILE_NAME,
  triggerReportDownload,
} from '../src/component/player/report-download';

describe('triggerReportDownload', () => {
  it('delegates to the host-provided download handler when present', async () => {
    const onDownloadReport = rs.fn().mockResolvedValue(undefined);

    await triggerReportDownload({
      content: '<html>report</html>',
      onDownloadReport,
    });

    expect(onDownloadReport).toHaveBeenCalledWith({
      content: '<html>report</html>',
      defaultFileName: DEFAULT_REPORT_FILE_NAME,
    });
  });

  it('falls back to browser blob download when no handler is provided', async () => {
    const anchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: rs.fn(),
    };
    const documentRef = {
      body: {
        appendChild: rs.fn(),
        removeChild: rs.fn(),
      },
      createElement: rs.fn(() => anchor),
    };
    const urlRef = {
      createObjectURL: rs.fn(() => 'blob:report'),
      revokeObjectURL: rs.fn(),
    };
    const blobFactory = rs.fn(() => ({}) as Blob);

    await triggerReportDownload({
      content: '<html>blob-report</html>',
      defaultFileName: 'custom-report.html',
      documentRef,
      urlRef,
      blobFactory,
      scheduleRevoke: (callback) => callback(),
    });

    expect(blobFactory).toHaveBeenCalledWith(['<html>blob-report</html>'], {
      type: 'text/html',
    });
    expect(documentRef.createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:report');
    expect(anchor.download).toBe('custom-report.html');
    expect(anchor.style.display).toBe('none');
    expect(documentRef.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(documentRef.body.removeChild).toHaveBeenCalledWith(anchor);
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
});
