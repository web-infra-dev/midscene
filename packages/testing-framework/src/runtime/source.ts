export interface FrameworkSuiteSourceCase {
  filePath: string;
  testName: string;
  resultFile: string;
}

export interface CreateYamlFrameworkSuiteSourceOptions {
  configPath: string;
  projectDir: string;
  cases: FrameworkSuiteSourceCase[];
  /** Import specifier for `@midscene/testing-framework/runtime`. */
  runtimeImport?: string;
  /** Import specifier for the Rstest test API. */
  rstestImport?: string;
}

/**
 * Generate the source of a single Rstest module that owns the whole YAML suite:
 * it sets the shared agent up once, registers one `test()` per YAML case, and
 * tears the agent down once. Each YAML case therefore maps to one Rstest test,
 * while suite-level setup/teardown and shared `state` are preserved.
 */
export function createYamlFrameworkSuiteSource(
  options: CreateYamlFrameworkSuiteSourceOptions,
): string {
  const runtimeImport =
    options.runtimeImport || '@midscene/testing-framework/runtime';
  const rstestImport = options.rstestImport || '@rstest/core';

  const tests = options.cases
    .map(
      (item) =>
        `test(${JSON.stringify(item.testName)}, async () => {\n  await runtime.runCase(${JSON.stringify(
          item.filePath,
        )}, ${JSON.stringify(item.resultFile)});\n});`,
    )
    .join('\n\n');

  return `import { afterAll, beforeAll, test } from ${JSON.stringify(rstestImport)};
import config from ${JSON.stringify(options.configPath)};
import { createSuiteRuntime } from ${JSON.stringify(runtimeImport)};

const runtime = createSuiteRuntime({
  config,
  projectDir: ${JSON.stringify(options.projectDir)},
});

beforeAll(async () => {
  await runtime.setup();
});

afterAll(async () => {
  await runtime.teardown();
});

${tests}
`;
}
