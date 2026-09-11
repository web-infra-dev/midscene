import { readFileSync } from 'node:fs';
import type { MidsceneYamlTargetConfig } from '@midscene/core';
import { parseYamlScript } from '@midscene/core/yaml';
import { JSON_SCHEMA, load } from 'js-yaml';
import { WorkflowParseError } from '../errors';
import type { WorkflowDocumentSource } from '../parser/types';
import { loadDotenvConfig } from '../runtime/dotenv-loader';
import { type LegacyWorkflow, adaptLegacyWorkflow } from './legacy-adapter';

const probeYaml = (content: string) =>
  load(content.replace(/\$\{[^}\r\n]*\}/g, 'MIDSCENE_ENV'), {
    schema: JSON_SCHEMA,
  });

export function isLegacyWorkflowFile(path: string): boolean {
  try {
    const value = probeYaml(readFileSync(path, 'utf8'));
    return (
      !!value && typeof value === 'object' && Object.hasOwn(value, 'tasks')
    );
  } catch {
    // Format detection does not own parse failures; collection records them.
    return false;
  }
}

/** Select and parse the frozen format before handing it to the pure adapter. */
export function collectLegacyWorkflow(
  source: WorkflowDocumentSource,
  cwd = process.cwd(),
  globalConfig?: MidsceneYamlTargetConfig,
): LegacyWorkflow | undefined {
  const content = readFileSync(source.absolutePath, 'utf8');
  // Legacy interpolation precedes YAML parsing, so an unquoted ${ENV} inside
  // a flow mapping is valid old input even though the original text is not.
  const value = probeYaml(content);
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'tasks'))
    return undefined;
  if (
    ['cases', 'beforeAll', 'beforeEach', 'afterEach', 'afterAll'].some((key) =>
      Object.hasOwn(value, key),
    )
  )
    throw new WorkflowParseError(
      'A workflow file cannot mix legacy tasks with native cases or lifecycle hooks.',
      { sourcePath: source.sourcePath },
    );
  // Preserve the old CLI's cwd/.env precedence at the compatibility boundary.
  loadDotenvConfig({ cwd });
  const sourceConfig = parseYamlScript(content, source.absolutePath);
  return adaptLegacyWorkflow(source, sourceConfig, globalConfig);
}
