import { compileFeatureFile } from './feature-file';
import type { GeneratedFeatureLoaderCase } from './rstest-project';

export interface FeatureLoaderOptions {
  source: string;
  featureFile: string;
  frameworkImport: string;
  rstestCoreImport: string;
  cases: GeneratedFeatureLoaderCase[];
}

interface FeatureLoaderContext {
  resourcePath: string;
  getOptions(): Omit<
    FeatureLoaderOptions,
    'source' | 'featureFile' | 'cases'
  > & {
    featureCasesByFile: Record<string, GeneratedFeatureLoaderCase[]>;
  };
}

const toImportLiteral = (value: string): string => JSON.stringify(value);

export function transformFeatureFileToRstestModule(
  options: FeatureLoaderOptions,
): string {
  const compiled = compileFeatureFile(options.source, options.featureFile);
  if (options.cases.length !== compiled.length) {
    throw new Error(
      `${options.featureFile}: Loader metadata count ${options.cases.length} does not match parsed case count ${compiled.length}`,
    );
  }

  const testCases = compiled.map((scenario, index) => {
    const metadata = options.cases[index];
    if (!metadata) {
      throw new Error(
        `${options.featureFile}: Missing loader metadata for scenario "${scenario.scenarioName}" at index ${index}`,
      );
    }
    if (metadata.caseId !== scenario.caseId) {
      throw new Error(
        `${options.featureFile}: Loader metadata for case "${metadata.caseId}" does not match parsed case "${scenario.caseId}" at index ${index}`,
      );
    }

    return {
      testName: metadata.testName,
      yamlFile: options.featureFile,
      resultFile: metadata.resultFile,
      caseOptions: {
        ...metadata.caseOptions,
        executionConfig: scenario.executionConfig,
      },
      ...(metadata.webRuntimeOptions
        ? { webRuntimeOptions: metadata.webRuntimeOptions }
        : {}),
    };
  });

  return `import { test } from ${toImportLiteral(options.rstestCoreImport)};
import { defineYamlCaseTest } from ${toImportLiteral(options.frameworkImport)};

const testCases = ${JSON.stringify(testCases, null, 2)};

for (const testOptions of testCases) {
  defineYamlCaseTest(test, testOptions);
}
`;
}

export default function featureLoader(
  this: FeatureLoaderContext,
  source: string,
): string {
  const loaderOptions = this.getOptions();
  const featureFile = this.resourcePath;

  return transformFeatureFileToRstestModule({
    source,
    featureFile,
    frameworkImport: loaderOptions.frameworkImport,
    rstestCoreImport: loaderOptions.rstestCoreImport,
    cases: loaderOptions.featureCasesByFile[featureFile] ?? [],
  });
}
