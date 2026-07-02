import type { GeneratedFeatureLoaderCase } from './rstest-project';

export interface FeatureLoaderOptions {
  frameworkImport: string;
  rstestCoreImport: string;
  cases: GeneratedFeatureLoaderCase[];
}

interface FeatureLoaderContext {
  resourcePath: string;
  getOptions(): Omit<FeatureLoaderOptions, 'cases'> & {
    featureCasesByFile: Record<string, GeneratedFeatureLoaderCase[]>;
  };
}

const toImportLiteral = (value: string): string => JSON.stringify(value);

export function transformFeatureFileToRstestModule(
  options: FeatureLoaderOptions,
): string {
  return `import { test } from ${toImportLiteral(options.rstestCoreImport)};
import { defineYamlCaseTest } from ${toImportLiteral(options.frameworkImport)};

const testCases = ${JSON.stringify(options.cases, null, 2)};

for (const testOptions of testCases) {
  defineYamlCaseTest(test, testOptions);
}
`;
}

export default function featureLoader(
  this: FeatureLoaderContext,
  _source: string,
): string {
  const loaderOptions = this.getOptions();
  const featureFile = this.resourcePath;
  const cases = loaderOptions.featureCasesByFile[featureFile];
  if (!cases) {
    throw new Error(`${featureFile}: Missing feature loader metadata`);
  }

  return transformFeatureFileToRstestModule({
    frameworkImport: loaderOptions.frameworkImport,
    rstestCoreImport: loaderOptions.rstestCoreImport,
    cases,
  });
}
