import {
  REPORT_ARTIFACT_SCRIPT_TYPE,
  assertReportArtifactPath,
  parseReportArtifactManifest,
} from '@midscene/shared/report-artifact';
import { antiEscapeScriptTag } from '@midscene/shared/utils';

/** Load external facts into the existing lazy report model without duplicating them in HTML. */
export async function hydrateDirectoryReport(
  doc: Document,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<void> {
  const marker = doc.querySelector(
    `script[type="${REPORT_ARTIFACT_SCRIPT_TYPE}"]`,
  );
  if (!marker || marker.getAttribute('data-loaded') === 'true') return;
  if (new URL(doc.baseURI).protocol === 'file:')
    throw new Error(
      'To open this directory report, run npx serve . in its directory and open the HTTP address.',
    );
  const manifestPath: unknown = JSON.parse(
    antiEscapeScriptTag(marker.textContent || ''),
  );
  assertReportArtifactPath(manifestPath);
  const read = async (path: string): Promise<string> => {
    assertReportArtifactPath(path);
    const url = new URL(path, doc.baseURI);
    const response = await fetcher(url.href, { signal, cache: 'no-store' });
    if (!response.ok)
      throw new Error(
        `Cannot load report data ${path}: HTTP ${response.status}`,
      );
    return response.text();
  };
  const manifest = parseReportArtifactManifest(
    JSON.parse(await read(manifestPath)),
  );
  const scripts: HTMLScriptElement[] = [];
  // Bound concurrent fetches and retain text; the Viewer still parses a group lazily.
  const jobs = manifest.groups.flatMap((group) =>
    group.dumps.map((path) => ({ group, path })),
  );
  for (let offset = 0; offset < jobs.length; offset += 4) {
    const batch = await Promise.all(
      jobs.slice(offset, offset + 4).map(async ({ group, path }) => {
        const content = await read(path);
        const script = doc.createElement('script');
        script.type = 'midscene_web_dump';
        script.textContent = content;
        for (const [key, value] of Object.entries({
          'data-group-id': group.id,
          ...group.attributes,
        })) {
          script.setAttribute(key, encodeURIComponent(String(value)));
        }
        return script;
      }),
    );
    scripts.push(...batch);
  }
  if (manifest.runner) {
    const script = doc.createElement('script');
    script.type = 'midscene_test_run_dump';
    script.textContent = await read(manifest.runner);
    scripts.push(script);
  }
  signal?.throwIfAborted();
  if (marker.getAttribute('data-loaded') === 'true') return;
  // Commit only after every required file loaded, so retries never see partial groups.
  for (const script of scripts) marker.parentNode!.insertBefore(script, marker);
  marker.setAttribute('data-loaded', 'true');
}
