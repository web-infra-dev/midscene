import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseReportArtifactManifest } from '@midscene/shared/report-artifact';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import type { TestRunReportDump } from '../test-run-report';
import type { IExecutionDump, IReportActionDump } from '../types';
import {
  extractReportArtifactPathAsync,
  extractReportArtifactPathSync,
  extractTestRunReportDumpSync,
  generateDumpScriptTag,
  streamDumpScriptsAsync,
  streamDumpScriptsSync,
} from './html-utils';

/** Async counterpart for servers; missing manifests identify ordinary inline HTML. */
export async function readReportArtifactManifestAsync(reportPath: string) {
  const manifestPath = join(dirname(reportPath), 'report.json');
  const exists = await stat(manifestPath)
    .then(() => true)
    .catch((error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
  if (!exists) return undefined;
  const entry = await extractReportArtifactPathAsync(reportPath);
  if (!entry) return undefined;
  const manifest = parseReportArtifactManifest(
    JSON.parse(await readFile(join(dirname(reportPath), entry), 'utf8')),
  );
  if (manifest.entry !== basename(reportPath))
    throw new Error('Report entry does not match its artifact manifest');
  return manifest;
}

/** Read the complete replay, retaining the latest progress for every execution ID. */
export async function readReportActionDump(
  reportPath: string,
): Promise<IReportActionDump> {
  let base: IReportActionDump | undefined;
  const executions = new Map<string, IExecutionDump>();
  let anonymous = 0;
  const collect = (content: string) => {
    const parsed = JSON.parse(content) as IReportActionDump;
    if (!parsed || !Array.isArray(parsed.executions))
      throw new Error(`Invalid report execution data: ${reportPath}`);
    base = parsed;
    for (const execution of parsed.executions)
      executions.set(
        execution.id ? `id:${execution.id}` : `anonymous:${anonymous++}`,
        execution,
      );
  };
  const manifest = await readReportArtifactManifestAsync(reportPath);
  if (manifest) {
    for (const group of manifest.groups) {
      for (const path of group.dumps)
        collect(await readFile(join(dirname(reportPath), path), 'utf8'));
    }
  } else {
    await streamDumpScriptsAsync(reportPath, ({ content }) => {
      collect(antiEscapeScriptTag(content));
      return false;
    });
  }
  if (!base) throw new Error(`No replay dump found in report: ${reportPath}`);
  return { ...base, executions: [...executions.values()] };
}

/** Read the versioned directory format; ordinary inline HTML stays self-contained. */
export function readReportArtifactManifest(reportPath: string) {
  const manifestPath = join(dirname(reportPath), 'report.json');
  if (!existsSync(manifestPath) || !existsSync(reportPath)) return undefined;
  const entry = extractReportArtifactPathSync(reportPath);
  if (!entry) return undefined;
  const manifest = parseReportArtifactManifest(
    JSON.parse(readFileSync(join(dirname(reportPath), entry), 'utf8')),
  );
  if (manifest.entry !== basename(reportPath))
    throw new Error('Report entry does not match its artifact manifest');
  return manifest;
}

export function readReportDumpScripts(
  reportPath: string,
): { openTag: string; content: string }[] {
  const dumps: { openTag: string; content: string }[] = [];
  streamReportDumpScripts(reportPath, (dump) => {
    dumps.push(dump);
    return false;
  });
  return dumps;
}

/** Stream inline HTML or external data one execution at a time. */
export function streamReportDumpScripts(
  reportPath: string,
  visitor: (dump: { openTag: string; content: string }) => boolean,
): void {
  const manifest = readReportArtifactManifest(reportPath);
  if (!manifest) {
    // The bundled Viewer can contain literal dump-tag strings. Generated
    // execution tags carry a group ID; template strings must not be parsed.
    streamDumpScriptsSync(reportPath, (dump) =>
      dump.openTag.includes('data-group-id') ? visitor(dump) : false,
    );
    return;
  }
  for (const group of manifest.groups) {
    for (const path of group.dumps) {
      const content = readFileSync(join(dirname(reportPath), path), 'utf8');
      // Validate before passing the data to synchronous report consumers.
      JSON.parse(content);
      const tag = generateDumpScriptTag(content, {
        'data-group-id': group.id,
        ...group.attributes,
      });
      if (visitor({ openTag: tag.slice(0, tag.indexOf('>') + 1), content }))
        return;
    }
  }
}

export function readReportRunnerDump(
  reportPath: string,
): TestRunReportDump | undefined {
  const manifest = readReportArtifactManifest(reportPath);
  if (!manifest) return extractTestRunReportDumpSync(reportPath) ?? undefined;
  if (!manifest.runner) return undefined;
  return JSON.parse(
    readFileSync(join(dirname(reportPath), manifest.runner), 'utf8'),
  ) as TestRunReportDump;
}
