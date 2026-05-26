import { describe, expect, it, vi } from 'vitest';
import { saveReportWithElectronShell } from '../src/renderer/playground/report-download';

describe('saveReportWithElectronShell', () => {
  it('writes the selected report file after the user confirms the save dialog', async () => {
    const shell = {
      chooseReportSavePath: vi
        .fn()
        .mockResolvedValue('/tmp/midscene-report.html'),
      writeReportFile: vi.fn().mockResolvedValue(undefined),
    };

    await saveReportWithElectronShell(
      {
        content: '<html>report</html>',
        defaultFileName: 'midscene_report.html',
      },
      shell,
    );

    expect(shell.chooseReportSavePath).toHaveBeenCalledWith(
      'midscene_report.html',
    );
    expect(shell.writeReportFile).toHaveBeenCalledWith({
      path: '/tmp/midscene-report.html',
      content: '<html>report</html>',
    });
  });

  it('does not write a file when the user cancels the save dialog', async () => {
    const shell = {
      chooseReportSavePath: vi.fn().mockResolvedValue(null),
      writeReportFile: vi.fn().mockResolvedValue(undefined),
    };

    await saveReportWithElectronShell(
      {
        content: '<html>report</html>',
        defaultFileName: 'midscene_report.html',
      },
      shell,
    );

    expect(shell.writeReportFile).not.toHaveBeenCalled();
  });

  it('throws when the Electron shell bridge is unavailable', async () => {
    await expect(
      saveReportWithElectronShell({
        content: '<html>report</html>',
        defaultFileName: 'midscene_report.html',
      }),
    ).rejects.toThrow('Studio report download is unavailable.');
  });
});
