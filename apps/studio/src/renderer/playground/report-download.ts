import type {
  ReportDownloadHandler,
  ReportDownloadRequest,
} from '@midscene/visualizer';
import type { ElectronShellApi } from '../../shared/electron-contract';

type StudioReportShell = Pick<
  ElectronShellApi,
  'chooseReportSavePath' | 'writeReportFile'
>;

export async function saveReportWithElectronShell(
  request: ReportDownloadRequest,
  shell?: Partial<StudioReportShell>,
): Promise<void> {
  const activeShell =
    shell ??
    ((globalThis.window as Window | undefined)?.electronShell as
      | Partial<StudioReportShell>
      | undefined);

  if (!activeShell?.chooseReportSavePath || !activeShell?.writeReportFile) {
    throw new Error('Studio report download is unavailable.');
  }

  const filePath = await activeShell.chooseReportSavePath(
    request.defaultFileName,
  );

  if (!filePath) {
    return;
  }

  await activeShell.writeReportFile({
    path: filePath,
    content: request.content,
  });
}

export const downloadStudioReport: ReportDownloadHandler = async (
  request: ReportDownloadRequest,
) => {
  await saveReportWithElectronShell(request);
};
