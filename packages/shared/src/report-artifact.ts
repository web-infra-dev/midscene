/** Browser-safe contract for a self-contained directory report. */
export const REPORT_ARTIFACT_SCHEMA_VERSION = 1;
export const REPORT_ARTIFACT_SCRIPT_TYPE = 'midscene_report_artifact';

export interface ReportArtifactGroup {
  id: string;
  /** State of this writer; a report is complete only after every writer completes. */
  status: 'running' | 'complete';
  attributes: Record<string, string | number | boolean>;
  dumps: string[];
}

export interface ReportArtifactManifest {
  schemaVersion: typeof REPORT_ARTIFACT_SCHEMA_VERSION;
  kind: 'agent' | 'test';
  status: 'running' | 'complete';
  reportId: string;
  entry: string;
  groups: ReportArtifactGroup[];
  runner?: string;
}

/** All artifact references stay inside the report directory on disk and HTTP. */
export function assertReportArtifactPath(
  path: unknown,
): asserts path is string {
  if (
    typeof path !== 'string' ||
    !/^(?:\.\/)?[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path) ||
    path
      .replace(/^\.\//, '')
      .split('/')
      .some((part) => part === '.' || part === '..')
  ) {
    throw new Error(`Invalid report artifact path: ${String(path)}`);
  }
}

export function parseReportArtifactManifest(
  value: unknown,
): ReportArtifactManifest {
  const fail = (): never => {
    throw new Error('Invalid or unsupported report artifact manifest');
  };
  if (typeof value !== 'object' || value === null) return fail();
  const manifest = value as Record<string, unknown>;
  if (
    manifest.schemaVersion !== REPORT_ARTIFACT_SCHEMA_VERSION ||
    !['agent', 'test'].includes(String(manifest.kind)) ||
    !['running', 'complete'].includes(String(manifest.status)) ||
    typeof manifest.reportId !== 'string' ||
    !manifest.reportId ||
    typeof manifest.entry !== 'string' ||
    !manifest.entry.endsWith('.html') ||
    /[\\/]/.test(manifest.entry) ||
    !Array.isArray(manifest.groups)
  )
    return fail();
  const ids = new Set<string>();
  for (const item of manifest.groups) {
    if (typeof item !== 'object' || item === null) return fail();
    const group = item as Record<string, unknown>;
    if (
      typeof group.id !== 'string' ||
      !group.id ||
      !['running', 'complete'].includes(String(group.status)) ||
      ids.has(group.id) ||
      !Array.isArray(group.dumps) ||
      typeof group.attributes !== 'object' ||
      group.attributes === null ||
      Array.isArray(group.attributes)
    )
      return fail();
    ids.add(group.id);
    for (const path of group.dumps) assertReportArtifactPath(path);
    for (const attribute of Object.values(group.attributes)) {
      if (
        !['string', 'number', 'boolean'].includes(typeof attribute) ||
        (typeof attribute === 'number' && !Number.isFinite(attribute))
      )
        return fail();
    }
  }
  if (
    manifest.groups.length > 0 &&
    manifest.status !==
      (manifest.groups.every((group) => group.status === 'complete')
        ? 'complete'
        : 'running')
  )
    return fail();
  if (manifest.runner !== undefined) assertReportArtifactPath(manifest.runner);
  return manifest as unknown as ReportArtifactManifest;
}
