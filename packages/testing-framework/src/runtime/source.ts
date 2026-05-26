export function createYamlFrameworkTestSource(options: {
  configPath: string;
  filePath: string;
  testName: string;
  runtimeImport: string;
  rstestImport: string;
}): string {
  return `import { test } from ${JSON.stringify(options.rstestImport)};
import config from ${JSON.stringify(options.configPath)};
import { runYamlFrameworkCase } from ${JSON.stringify(options.runtimeImport)};

test(${JSON.stringify(options.testName)}, async () => {
  await runYamlFrameworkCase({
    config,
    configPath: ${JSON.stringify(options.configPath)},
    filePath: ${JSON.stringify(options.filePath)}
  });
});
`;
}
