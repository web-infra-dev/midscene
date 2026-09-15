import type { MidsceneYamlScript } from '../types';
import { resolveWebTarget } from './utils';

/** Match old web-target options followed by explicit Agent overrides. */
export function isYamlReportEnabled(
  script: Omit<MidsceneYamlScript, 'tasks'>,
): boolean {
  return (
    (script.agent?.generateReport ??
      resolveWebTarget(script)?.target.generateReport) !== false
  );
}
