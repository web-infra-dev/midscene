import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { classifyWorkflowDocumentFormat } from '@midscene/core/internal/test-runner';
import { JSON_SCHEMA, load as loadYaml } from 'js-yaml';

const probeWorkflowFormat = (file: string) => {
  try {
    const content = readFileSync(file, 'utf8').replace(
      /\$\{[^}\r\n]*\}/g,
      'MIDSCENE_ENV',
    );
    return classifyWorkflowDocumentFormat(
      loadYaml(content, { schema: JSON_SCHEMA }),
    );
  } catch {
    // The legacy parser remains responsible for syntax and schema failures.
    return 'unknown' as const;
  }
};

export const assertLegacyBatchConfigPath = (configPath: string): void => {
  if (!['.yaml', '.yml'].includes(extname(configPath).toLowerCase())) {
    throw new Error(
      `midscene --config only accepts a legacy YAML batch config: ${configPath}. Run a native Test project config with \`midscene-test --config ${configPath}\`.`,
    );
  }
};

/** Reject wrong-command inputs before any browser, device, or Agent is created. */
export const assertLegacyWorkflowSelection = (
  files: readonly string[],
): void => {
  const nativeFiles: string[] = [];
  const mixedFiles: string[] = [];

  for (const file of new Set(files.map((item) => resolve(item)))) {
    const format = probeWorkflowFormat(file);
    if (format === 'native') nativeFiles.push(file);
    else if (format === 'mixed') mixedFiles.push(file);
  }

  if (nativeFiles.length === 0 && mixedFiles.length === 0) return;

  const details = [
    ...nativeFiles.map((file) => `- native cases/steps: ${file}`),
    ...mixedFiles.map((file) => `- mixed tasks/flow and cases/steps: ${file}`),
  ];
  throw new Error(
    [
      'midscene only runs legacy tasks/flow YAML.',
      ...details,
      'Run native files with `midscene-test`, and keep legacy and native formats in separate files and command invocations.',
    ].join('\n'),
  );
};
