import { ifInBrowser } from '@midscene/shared/utils';
import type { GroupedActionDump } from './dump';
import { getReportTpl, insertScriptBeforeClosingHtml } from './utils';

/**
 * ReportWriter handles writing GroupedActionDump to HTML reports.
 * Supports both overwrite and append modes.
 */
export class ReportWriter {
  private initialized = new Map<string, boolean>();

  /**
   * Write report to file
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

    if (!append) {
      // Overwrite mode: write complete report
      fs.writeFileSync(reportPath, `${tpl}\n${scriptContent}`);
    } else {
      // Append mode: insert content before </html>
      const isValidTemplate = tpl.includes('</html>');

      if (!this.initialized.get(reportPath)) {
        if (isValidTemplate) {
          fs.writeFileSync(reportPath, tpl);
        } else {
          // Use minimal HTML wrapper if template is invalid (e.g., placeholder in test env)
          fs.writeFileSync(
            reportPath,
            `<!DOCTYPE html><html><head></head><body>\n${scriptContent}\n</body></html>`,
          );
          this.initialized.set(reportPath, true);
          return reportPath;
        }
        this.initialized.set(reportPath, true);
      }

      insertScriptBeforeClosingHtml(reportPath, scriptContent);
    }

    return reportPath;
  }

  /**
   * Write report to directory with screenshots as separate PNG files
   * @param dump - GroupedActionDump instance
   * @param outputDir - Output directory path
   * @returns The index.html file path
   */
  async writeDirectory(
    dump: GroupedActionDump,
    outputDir: string,
  ): Promise<string> {
    return dump.writeToDirectory(outputDir);
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
