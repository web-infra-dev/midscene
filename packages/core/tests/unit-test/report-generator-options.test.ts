import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ReportGenerator, nullReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import {
  createExecution,
  defaultReportMeta,
  fakeBase64,
  getReportGeneratorTmpDir,
} from './test-helpers/report-generator';

describe('ReportGenerator options and factory', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = getReportGeneratorTmpDir('report-options');
  });

  afterEach(() => {
    if (existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
    rs.restoreAllMocks();
  });

  it('provides a null generator when report generation is disabled', async () => {
    expect(ReportGenerator.create('disabled', { generateReport: false })).toBe(
      nullReportGenerator,
    );
    const execution = createExecution([
      ScreenshotItem.create(fakeBase64(100), Date.now()),
    ]);
    nullReportGenerator.onExecutionUpdate(execution, defaultReportMeta);
    await expect(nullReportGenerator.finalize()).resolves.toBeUndefined();
    expect(nullReportGenerator.getReportPath()).toBeUndefined();
  });

  it('rejects contradictory and empty options before returning a null generator', () => {
    expect(() => ReportGenerator.create('', { generateReport: false })).toThrow(
      'reportFileName must be a non-empty string',
    );
    expect(() =>
      ReportGenerator.create('invalid', {
        generateReport: false,
        persistExecutionDump: true,
      }),
    ).toThrow(
      'persistExecutionDump cannot be true when generateReport is false',
    );
  });

  it('selects inline and directory report paths without duplicating extensions', () => {
    expect(ReportGenerator.create('inline', {}).getReportPath()).toContain(
      'inline.html',
    );
    expect(
      ReportGenerator.create('already.html', {}).getReportPath(),
    ).toContain('already.html');
    expect(
      ReportGenerator.create('directory', {
        outputFormat: 'html-and-external-assets',
      }).getReportPath(),
    ).toContain(join('directory', 'index.html'));
  });

  it('rejects unsafe and overlong report names', () => {
    for (const name of ['../bad-name', 'bad/name']) {
      expect(() => ReportGenerator.create(name, {})).toThrow(
        'reportFileName must not contain path separators',
      );
    }
    for (const name of ['bad:name', 'bad*name']) {
      expect(() => ReportGenerator.create(name, {})).toThrow(
        'reportFileName contains illegal filename characters',
      );
    }
    expect(() =>
      ReportGenerator.create('中'.repeat(83), { generateReport: false }),
    ).not.toThrow();
    expect(() =>
      ReportGenerator.create('中'.repeat(84), { generateReport: false }),
    ).toThrow('maximum is 255');
    expect(() =>
      ReportGenerator.create('中'.repeat(85), {
        generateReport: false,
        outputFormat: 'html-and-external-assets',
      }),
    ).not.toThrow();
    expect(() =>
      ReportGenerator.create('中'.repeat(86), {
        generateReport: false,
        outputFormat: 'html-and-external-assets',
      }),
    ).toThrow('maximum is 255');
  });

  it.each([undefined, false])(
    'does not persist execution JSON when persistExecutionDump is %s',
    async (persistExecutionDump) => {
      const generator = ReportGenerator.create(
        `no-execution-dump-${String(persistExecutionDump)}`,
        {
          persistExecutionDump,
          autoPrintReportMsg: false,
        },
      ) as ReportGenerator;
      generator.onExecutionUpdate(
        createExecution([ScreenshotItem.create(fakeBase64(100), Date.now())]),
        defaultReportMeta,
      );
      await generator.flush();

      const rootFiles = readdirSync(dirname(generator.getReportPath()!)).filter(
        (name) => /^\d+\.execution\.json(?:\.screenshots)?$/.test(name),
      );
      expect(rootFiles).toEqual([]);
    },
  );

  it('prints an inline report path once after the first write', async () => {
    const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    const reportPath = join(temporaryDirectory, 'autoprint-inline.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'inline',
    });
    const execution = createExecution([
      ScreenshotItem.create(fakeBase64(100), Date.now()),
    ]);

    expect(logSpy).not.toHaveBeenCalled();
    generator.onExecutionUpdate(execution, defaultReportMeta);
    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.finalize();

    const updatedLogs = logSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('report file updated'));
    expect(updatedLogs).toEqual([
      `Midscene - report file updated: ${reportPath}`,
    ]);
  });

  it('supports disabled logging and directory-mode serve instructions', async () => {
    const logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    const quietGenerator = new ReportGenerator({
      reportPath: join(temporaryDirectory, 'quiet.html'),
      screenshotMode: 'inline',
      autoPrint: false,
    });
    quietGenerator.onExecutionUpdate(createExecution([]), defaultReportMeta);
    await quietGenerator.flush();
    expect(logSpy).not.toHaveBeenCalled();

    const reportDirectory = join(temporaryDirectory, 'directory');
    const directoryGenerator = new ReportGenerator({
      reportPath: join(reportDirectory, 'index.html'),
      screenshotMode: 'directory',
    });
    directoryGenerator.onExecutionUpdate(
      createExecution([ScreenshotItem.create(fakeBase64(100), Date.now())]),
      defaultReportMeta,
    );
    await directoryGenerator.flush();
    expect(logSpy).toHaveBeenCalledWith(
      `Midscene - report file updated: npx serve ${reportDirectory}`,
    );
  });
});
