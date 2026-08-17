import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeReportActions } from '@midscene/core';
import yaml from 'js-yaml';

interface UIActionDefinition {
  name: string;
  action: {
    name: string;
    param?: unknown;
  };
}

interface UIActionManifest {
  version: 1;
  interface: string;
  actions: UIActionDefinition[];
}

interface XpathLocator {
  prompt?: string;
  xpath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function xpathLocators(value: unknown): XpathLocator[] {
  if (Array.isArray(value)) {
    return value.flatMap(xpathLocators);
  }
  if (!isRecord(value)) return [];

  const target = isRecord(value.target) ? value.target : undefined;
  const xpath =
    target?.strategy === 'xpath' &&
    typeof target.selector === 'string' &&
    target.selector.trim()
      ? target.selector.trim()
      : typeof value.xpath === 'string' && value.xpath.trim()
        ? value.xpath.trim()
        : undefined;
  const ownLocator = xpath
    ? [
        {
          prompt:
            typeof value.prompt === 'string' && value.prompt.trim()
              ? value.prompt.trim()
              : undefined,
          xpath,
        },
      ]
    : [];
  return [
    ...ownLocator,
    ...Object.entries(value)
      .filter(
        ([key]) => key !== 'xpath' && key !== 'target' && key !== 'prompt',
      )
      .flatMap(([, item]) => xpathLocators(item)),
  ];
}

export interface RecordXpathMapArtifact {
  actionDir: string;
  actionFiles: string[];
  coordinateFallbackFiles: string[];
  mapPath: string;
  manifestPath: string;
  elementCount: number;
  mapSha256: string;
  steps: Array<{
    step: number;
    actionFile: string;
    actionName: string;
    actionDisplayName: string;
    elementName: string;
    xpath: string;
  }>;
}

export async function generateRecordXpathMap(
  reportPath: string,
  outputDir: string,
): Promise<RecordXpathMapArtifact> {
  const actionDir = path.join(outputDir, 'ui-actions');
  const analysis = analyzeReportActions({
    htmlPath: reportPath,
    outputDir: actionDir,
    overwrite: true,
  });
  const elements: Record<string, string> = {};
  const steps: RecordXpathMapArtifact['steps'] = [];

  let actionIndex = 0;
  for (const actionFile of analysis.actionFiles) {
    const manifest = yaml.load(
      await readFile(actionFile, 'utf8'),
    ) as UIActionManifest;
    for (const definition of manifest.actions) {
      actionIndex += 1;
      for (const [locatorIndex, locator] of xpathLocators(
        definition.action.param,
      ).entries()) {
        const baseName = locator.prompt || definition.name;
        let elementName = baseName;
        let suffix = 2;
        while (
          elements[elementName] !== undefined &&
          elements[elementName] !== locator.xpath
        ) {
          elementName = `${baseName} [observed step ${actionIndex}.${locatorIndex + 1}; alternative ${suffix}]`;
          suffix += 1;
        }
        elements[elementName] = locator.xpath;
        steps.push({
          step: actionIndex,
          actionFile: path.basename(actionFile),
          actionName: definition.action.name,
          actionDisplayName: definition.name,
          elementName,
          xpath: locator.xpath,
        });
      }
    }
  }

  if (Object.keys(elements).length === 0) {
    throw new Error(
      `Record report did not contain a reusable XPath: ${reportPath}`,
    );
  }
  if (analysis.coordinateFallbackFiles.length > 0) {
    throw new Error(
      `Record report contains ${analysis.coordinateFallbackActionCount} coordinate-only action(s); cannot build a complete XPath Map: ${reportPath}`,
    );
  }

  await mkdir(outputDir, { recursive: true });
  const mapPath = path.join(outputDir, 'element-xpaths.yaml');
  const manifestPath = path.join(outputDir, 'manifest.json');
  const mapContent = yaml.dump(
    { elements },
    { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false },
  );
  await writeFile(mapPath, mapContent, 'utf8');
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceReport: path.basename(reportPath),
        actionFiles: analysis.actionFiles.map((file) => path.basename(file)),
        coordinateFallbackFiles: analysis.coordinateFallbackFiles.map((file) =>
          path.basename(file),
        ),
        steps,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return {
    actionDir,
    actionFiles: analysis.actionFiles,
    coordinateFallbackFiles: analysis.coordinateFallbackFiles,
    mapPath,
    manifestPath,
    elementCount: Object.keys(elements).length,
    mapSha256: createHash('sha256').update(mapContent).digest('hex'),
    steps,
  };
}
