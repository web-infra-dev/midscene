import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunBaseDir, getMidsceneRunSubDir } from '../common';

export interface CliReportSession {
  version: 1;
  sessionName: string;
  targetIdentity?: string;
  reportFileName: string;
  reportPath: string;
  createdAt: number;
}

const sessionDirName = 'cli-report-session';

function sanitizeSessionName(sessionName: string): string {
  return sessionName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
}

function sanitizeFileSegment(segment: string): string {
  const sanitized = segment.replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown';
  return sanitized.slice(0, 80);
}

function ensureHtmlFileName(reportFileName: string): string {
  return reportFileName.endsWith('.html')
    ? reportFileName
    : `${reportFileName}.html`;
}

function formatDateForFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
  const time = [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
  return `${day}_${time}`;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getCliReportSessionDir(): string {
  const dir = join(getMidsceneRunBaseDir(), sessionDirName);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getCliReportSessionPath(sessionName: string): string {
  return join(
    getCliReportSessionDir(),
    `${sanitizeSessionName(sessionName)}.json`,
  );
}

export function generateCliReportSession(
  sessionName: string,
  targetIdentity?: string,
): CliReportSession {
  const identitySegment = targetIdentity
    ? `-${sanitizeFileSegment(targetIdentity)}`
    : '';
  const reportFileName = `${sanitizeSessionName(sessionName)}${identitySegment}-${formatDateForFileName(new Date())}-${randomId()}`;
  const reportPath = join(
    getMidsceneRunSubDir('report'),
    ensureHtmlFileName(reportFileName),
  );
  const session: CliReportSession = {
    version: 1,
    sessionName,
    ...(targetIdentity ? { targetIdentity } : {}),
    reportFileName,
    reportPath,
    createdAt: Date.now(),
  };
  return session;
}

export function writeCliReportSession(session: CliReportSession): void {
  writeFileSync(
    getCliReportSessionPath(session.sessionName),
    JSON.stringify(session, null, 2),
    'utf-8',
  );
}

export function createCliReportSession(
  sessionName: string,
  targetIdentity?: string,
): CliReportSession {
  const session = generateCliReportSession(sessionName, targetIdentity);
  writeCliReportSession(session);
  return session;
}

export function readCliReportSession(
  sessionName: string,
): CliReportSession | undefined {
  const sessionPath = getCliReportSessionPath(sessionName);
  if (!existsSync(sessionPath)) {
    return undefined;
  }

  try {
    const raw = readFileSync(sessionPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CliReportSession>;
    if (
      parsed.version !== 1 ||
      parsed.sessionName !== sessionName ||
      typeof parsed.reportFileName !== 'string' ||
      !parsed.reportFileName.trim() ||
      /[\\/]/.test(parsed.reportFileName)
    ) {
      return undefined;
    }

    return parsed as CliReportSession;
  } catch {
    return undefined;
  }
}
