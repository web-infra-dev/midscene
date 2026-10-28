import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseReportArtifactManifest } from '@midscene/shared/report-artifact';
import type { TestRunReportDump } from '../test-run-report';
import {
  extractReportArtifactPathSync,
  extractTestRunReportDumpSync,
  generateDumpScriptTag,
  streamDumpScriptsSync,
} from './html-utils';

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
