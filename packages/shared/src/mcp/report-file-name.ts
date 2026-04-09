import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getMidsceneRunBaseDir } from '../common';

const REPORT_NAME_STATE_FILE = 'current-report-name';

function getReportNameStateFilePath() {
  return path.join(getMidsceneRunBaseDir(), REPORT_NAME_STATE_FILE);
}

export function readPersistedReportFileName(): string | undefined {
  const filePath = getReportNameStateFilePath();
  if (!existsSync(filePath)) {
    return undefined;
  }

  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return undefined;
  }

  return content;
}

export function persistReportFileName(reportFileName: string): void {
  if (!reportFileName.trim()) {
    throw new Error('reportFileName must not be empty');
  }

  const filePath = getReportNameStateFilePath();
  writeFileSync(filePath, `${reportFileName}\n`, 'utf-8');
}
