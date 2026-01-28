import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';
import type { GroupedActionDump } from './types';
import { getReportTpl, insertScriptBeforeClosingHtml } from './utils';

const debug = getDebug('report-writer');

/**
 * ReportWriter handles writing GroupedActionDump to HTML reports.
 * Supports both overwrite and append modes.
 * Manages an internal write queue to ensure sequential writes.
 */
export class ReportWriter {
  private initialized = new Map<string, boolean>();

  /**
   * Internal write queue to ensure sequential writes.
   * Each write operation is chained to the previous one.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Schedule a write operation. The actual write is queued and executed sequentially.
   * This method returns immediately (fire-and-forget).
   *
   * @param dump - GroupedActionDump instance
   * @param reportPath - Report file path
   * @param append - Whether to append to existing report (default: false)
   */
  scheduleWrite(
    dump: GroupedActionDump,
    reportPath: string,
    append = false,
  ): void {
    this.writeQueue = this.writeQueue
      .then(() => this.doWrite(dump, reportPath, append))
      .then(() => {
        debug('Scheduled write completed:', reportPath);
      })
      .catch((error) => {
        console.error('Error in scheduled write:', error);
        debug('scheduleWrite error:', error);
      });
  }

  /**
   * Schedule a directory write operation.
   * This method returns immediately (fire-and-forget).
   *
   * @param dump - GroupedActionDump instance
   * @param outputDir - Output directory path
   */
  scheduleWriteDirectory(dump: GroupedActionDump, outputDir: string): void {
    this.writeQueue = this.writeQueue
      .then(() => this.doWriteDirectory(dump, outputDir))
      .then(() => {
        debug('Scheduled directory write completed:', outputDir);
      })
      .catch((error) => {
        console.error('Error in scheduled directory write:', error);
        debug('scheduleWriteDirectory error:', error);
      });
  }

  /**
   * Wait for all pending write operations to complete.
   * Call this before destroying the agent to ensure all writes are flushed.
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  /**
   * Write report to file (blocking version).
   * Prefer using scheduleWrite() for non-blocking writes.
   *
   * @param dump - GroupedActionDump instance
   * @param reportPath - Report file path
   * @param append - Whether to append to existing report (default: false)
   * @returns The report file path
   */
  async write(
    dump: GroupedActionDump,
    reportPath: string,
    append = false,
  ): Promise<string> {
    return this.doWrite(dump, reportPath, append);
  }

  /**
   * Internal write implementation
   */
  private async doWrite(
    dump: GroupedActionDump,
    reportPath: string,
    append = false,
  ): Promise<string> {
    if (ifInBrowser) {
      console.warn('ReportWriter.write is not supported in browser');
      return '';
    }

    const [fs, path] = await Promise.all([
      import('node:fs'),
      import('node:path'),
    ]);

    // Ensure directory exists
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const scriptContent = await dump.toHTML();
    const tpl = getReportTpl();

    // Overwrite mode: write complete report with template and content
    if (!append) {
      fs.writeFileSync(reportPath, `${tpl}\n${scriptContent}`);
      return reportPath;
    }

    // Append mode: initialize template first, then insert content
    const isValidTemplate = tpl.includes('</html>');
    const needsInitialization = !this.initialized.get(reportPath);

    if (needsInitialization) {
      this.initialized.set(reportPath, true);

      // Invalid template (e.g., placeholder in test env): use minimal HTML wrapper
      if (!isValidTemplate) {
        const minimalHtml = `<!DOCTYPE html><html><head></head><body>\n${scriptContent}\n</body></html>`;
        fs.writeFileSync(reportPath, minimalHtml);
        return reportPath;
      }

      fs.writeFileSync(reportPath, tpl);
    }

    insertScriptBeforeClosingHtml(reportPath, scriptContent);
    return reportPath;
  }

  /**
   * Internal directory write implementation
   */
  private async doWriteDirectory(
    dump: GroupedActionDump,
    outputDir: string,
  ): Promise<string> {
    return dump.writeToDirectory(outputDir);
  }

  /**
   * Write report to directory with screenshots as separate PNG files (blocking version).
   * Prefer using scheduleWriteDirectory() for non-blocking writes.
   *
   * @param dump - GroupedActionDump instance
   * @param outputDir - Output directory path
   * @returns The index.html file path
   */
  async writeDirectory(
    dump: GroupedActionDump,
    outputDir: string,
  ): Promise<string> {
    return this.doWriteDirectory(dump, outputDir);
  }

  /**
   * Reset initialization state for a specific report path
   * Useful for testing or when starting a new report session
   */
  resetInitialization(reportPath?: string): void {
    if (reportPath) {
      this.initialized.delete(reportPath);
    } else {
      this.initialized.clear();
    }
  }
}
