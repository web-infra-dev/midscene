import type { MidsceneYamlScript, MidsceneYamlTargetConfig } from '../types';

/** Match old web-target options followed by explicit Agent overrides. */
export function isYamlReportEnabled(
  script: MidsceneYamlTargetConfig & Pick<MidsceneYamlScript, 'agent'>,
): boolean {
  // Report intent remains useful before target or task validation succeeds.
  // Target grammar is validated by the parser, not by report publication.
  const webTarget =
    script.page ?? script.browser ?? script.web ?? script.target;
  return (script.agent?.generateReport ?? webTarget?.generateReport) !== false;
}
