import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RsbuildConfig, createRsbuild } from '@rsbuild/core';
import { reportTemplateConfig } from '../../dashboard/rsbuild.report.config.js';
import type { MidsceneResultsFileData } from '../midscene/types.js';
import { outputCacheDir, workspaceRoot } from '../runtime/paths.js';
import { embedReportImages } from './embed-images.js';

const evaluationReportPageDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(evaluationReportPageDir, '../../dashboard');
const reportTemplatePlaceholder = '__GROUNDING_RESULTS_DATA__';
const templateDistDir = path.join(outputCacheDir, 'report-template');
const templateHtmlPath = path.join(templateDistDir, 'index.html');
const logoMimeTypes = new Map([
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function escapeJsonForHtml(resultsData: MidsceneResultsFileData): string {
  return JSON.stringify(resultsData)
    .replaceAll('<', '\\u003C')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function resolveLogoPath(logoPath: string): string | null {
  const normalizedLogoPath = logoPath.trim();
  if (
    !normalizedLogoPath ||
    normalizedLogoPath.startsWith('data:') ||
    /^https?:\/\//i.test(normalizedLogoPath)
  ) {
    return null;
  }

  return path.isAbsolute(normalizedLogoPath)
    ? normalizedLogoPath
    : path.resolve(workspaceRoot, normalizedLogoPath);
}

async function readLogoDataUri(logoPath: string): Promise<string | undefined> {
  const absoluteLogoPath = resolveLogoPath(logoPath);
  if (!absoluteLogoPath) {
    return undefined;
  }

  const mimeType = logoMimeTypes.get(
    path.extname(absoluteLogoPath).toLowerCase(),
  );
  if (!mimeType) {
    return undefined;
  }

  try {
    const content = await readFile(absoluteLogoPath);
    return `data:${mimeType};base64,${content.toString('base64')}`;
  } catch {
    return undefined;
  }
}

async function enrichModelLogoDataUris(
  resultsData: MidsceneResultsFileData,
): Promise<MidsceneResultsFileData> {
  const models = await Promise.all(
    resultsData.models.map(async (model) => {
      if (model.logoDataUri || !model.logo) {
        return model;
      }

      const logoDataUri = await readLogoDataUri(model.logo);
      return logoDataUri ? { ...model, logoDataUri } : model;
    }),
  );

  return {
    ...resultsData,
    models,
  };
}

async function collectNewestSourceMtimeMs(dirPath: string): Promise<number> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  let newest = 0;

  for (const entry of entries) {
    if (entry.name === 'node_modules') {
      continue;
    }

    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await collectNewestSourceMtimeMs(absolutePath));
      continue;
    }

    if (!/\.(tsx?|html|css|json|svg|png|ico)$/.test(entry.name)) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    newest = Math.max(newest, fileStat.mtimeMs);
  }

  return newest;
}

async function shouldRebuildTemplate(): Promise<boolean> {
  try {
    const [templateStat, newestSourceMtimeMs] = await Promise.all([
      stat(templateHtmlPath),
      collectNewestSourceMtimeMs(dashboardDir),
    ]);
    return newestSourceMtimeMs > templateStat.mtimeMs;
  } catch {
    return true;
  }
}

async function ensureReportPageTemplate(): Promise<string> {
  const needsRebuild = await shouldRebuildTemplate();
  if (!needsRebuild) {
    return readFile(templateHtmlPath, 'utf-8');
  }

  const distPathRoot = path.relative(dashboardDir, templateDistDir);
  const rsbuildConfig: RsbuildConfig = {
    ...reportTemplateConfig,
    output: {
      ...reportTemplateConfig.output,
      distPath: {
        ...(typeof reportTemplateConfig.output?.distPath === 'object'
          ? reportTemplateConfig.output.distPath
          : {}),
        root: distPathRoot,
      },
    },
  };

  const rsbuild = await createRsbuild({
    cwd: dashboardDir,
    rsbuildConfig,
  });

  await rm(templateDistDir, { recursive: true, force: true });
  await rsbuild.build();
  return readFile(templateHtmlPath, 'utf-8');
}

export async function buildSingleReportPage(input: {
  resultsData: MidsceneResultsFileData;
  reportFilePath: string;
  standalone?: boolean;
}): Promise<void> {
  await mkdir(path.dirname(input.reportFilePath), { recursive: true });
  const templateHtml = await ensureReportPageTemplate();
  const dataWithImages =
    input.standalone === false
      ? input.resultsData
      : await embedReportImages(
          input.resultsData,
          path.dirname(input.reportFilePath),
        );
  const reportData = await enrichModelLogoDataUris(dataWithImages);
  const resultsDataJson = escapeJsonForHtml(reportData);

  if (!templateHtml.includes(reportTemplatePlaceholder)) {
    throw new Error('报告模板中未找到 report-results 占位符');
  }

  const html = templateHtml.replace(
    reportTemplatePlaceholder,
    () => resultsDataJson,
  );
  await writeFile(input.reportFilePath, html, 'utf-8');
}

export async function buildLiveReportPage(input: {
  reportFilePath: string;
}): Promise<void> {
  await mkdir(path.dirname(input.reportFilePath), { recursive: true });
  const templateHtml = await ensureReportPageTemplate();
  await writeFile(input.reportFilePath, templateHtml, 'utf-8');
}
