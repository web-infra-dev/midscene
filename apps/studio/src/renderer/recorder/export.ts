import {
  createMidsceneRecorderMarkdownScreenshotAssets,
  getMidsceneRecorderEventDescription,
  sanitizeMidsceneRecorderFileName,
} from '@midscene/shared/recorder';
import type {
  ElectronShellApi,
  SaveFileFilter,
} from '@shared/electron-contract';
import JSZip from 'jszip';
import type { StudioRecordedEvent, StudioRecordingSession } from './types';

function getElectronShell(): Pick<
  ElectronShellApi,
  'chooseFileSavePath' | 'writeFile'
> {
  const shell = (globalThis.window as Window | undefined)?.electronShell;
  if (!shell?.chooseFileSavePath || !shell?.writeFile) {
    throw new Error('Studio file export bridge is unavailable.');
  }
  return shell;
}

function isMissingGenericFileBridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('No handler registered') &&
    (message.includes('choose-file-save-path') ||
      message.includes('write-file'))
  );
}

function getExportMimeType(filters: SaveFileFilter[]) {
  const extension = filters[0]?.extensions[0];
  switch (extension) {
    case 'json':
      return 'application/json';
    case 'yaml':
    case 'yml':
      return 'application/x-yaml';
    case 'zip':
      return 'application/zip';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    default:
      return 'text/plain';
  }
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function triggerBrowserDownload(options: {
  defaultFileName: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
  filters: SaveFileFilter[];
}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Studio file export bridge is unavailable.');
  }

  const data =
    options.encoding === 'base64'
      ? base64ToBytes(options.content)
      : options.content;
  const blob = new Blob([data], { type: getExportMimeType(options.filters) });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.defaultFileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function sanitizeFileName(value: string) {
  return sanitizeMidsceneRecorderFileName(value);
}

function scalarToYaml(value: string | number | boolean) {
  return JSON.stringify(value);
}

function eventDescription(event: StudioRecordedEvent) {
  return getMidsceneRecorderEventDescription(event);
}

function markdownZipPath(relativePath: string) {
  return relativePath.replace(/^\.\//, '');
}

function screenshotAssetMap(
  session: StudioRecordingSession,
  screenshotBaseDir: string,
) {
  const assets = createMidsceneRecorderMarkdownScreenshotAssets(
    session.events,
    {
      baseDir: screenshotBaseDir,
    },
  );
  return {
    assets,
    assetByHashId: new Map(
      assets.map((asset) => [asset.eventHashId, asset.relativePath]),
    ),
  };
}

function addMarkdownScreenshotAssetsToZip(
  zip: JSZip,
  session: StudioRecordingSession,
  options: {
    screenshotBaseDir: string;
    zipPrefix?: string;
  },
) {
  const assets = createMidsceneRecorderMarkdownScreenshotAssets(
    session.events,
    {
      baseDir: options.screenshotBaseDir,
    },
  );
  for (const asset of assets) {
    zip.file(
      `${options.zipPrefix || ''}${markdownZipPath(asset.relativePath)}`,
      asset.base64Data,
      {
        base64: true,
      },
    );
  }
  return assets;
}

function rewriteMarkdownScreenshotBaseDir(
  markdown: string,
  screenshotBaseDir: string,
) {
  if (screenshotBaseDir === './screenshots') {
    return markdown;
  }
  return markdown.split('./screenshots/').join(`${screenshotBaseDir}/`);
}

function targetText(session: StudioRecordingSession) {
  return (
    session.url ||
    session.target.values.url ||
    session.target.label ||
    session.target.deviceId ||
    'Recorded target'
  );
}

function stepText(event: StudioRecordedEvent) {
  const description = eventDescription(event);
  switch (event.type) {
    case 'navigation':
      return event.url ? `Open ${event.url}` : description;
    case 'click':
      return event.elementDescription
        ? `Tap "${description}"`
        : `Tap the target shown in the screenshot. Recorded hint: ${description}`;
    case 'input':
      return `Input ${JSON.stringify(event.value || '')} into "${description}"`;
    case 'keydown':
      return `Press ${event.value || description}`;
    case 'scroll':
      return `Scroll as recorded: ${description}`;
    default:
      return description;
  }
}

function eventToYamlFlow(event: StudioRecordedEvent) {
  const description = eventDescription(event);
  switch (event.type) {
    case 'click':
      return [`      - aiTap: ${scalarToYaml(description)}`];
    case 'input':
      return [
        `      - aiInput: ${scalarToYaml(description)}`,
        `        value: ${scalarToYaml(event.value || '')}`,
      ];
    case 'keydown':
      return [`      - aiKeyboardPress: ${scalarToYaml(event.value || '')}`];
    case 'scroll':
      return [`      - aiAction: ${scalarToYaml(description)}`];
    case 'navigation':
      return [`      - aiAction: ${scalarToYaml(description)}`];
    default:
      return [`      - aiAction: ${scalarToYaml(description)}`];
  }
}

export function generateStudioRecorderJson(session: StudioRecordingSession) {
  return JSON.stringify(session, null, 2);
}

export function generateStudioRecorderMarkdown(
  sessions: StudioRecordingSession[],
) {
  const lines = ['# Midscene Studio Recordings', ''];
  for (const session of sessions) {
    lines.push(
      `## ${session.name}`,
      '',
      `- Platform: ${session.target.platformId}`,
      `- Target: ${
        session.url ||
        session.target.label ||
        session.target.deviceId ||
        'Unknown'
      }`,
      session.description ? `- Description: ${session.description}` : '',
      `- Events: ${session.events.length}`,
      `- Updated: ${new Date(session.updatedAt).toISOString()}`,
      '',
      '| # | Type | Description |',
      '| --- | --- | --- |',
    );
    if (session.events.length === 0) {
      lines.push('| - | - | No events recorded |');
    } else {
      session.events.forEach((event, index) => {
        lines.push(
          `| ${index + 1} | ${event.type} | ${eventDescription(event).replace(/\|/g, '\\|')} |`,
        );
      });
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function generateStudioRecorderYaml(session: StudioRecordingSession) {
  const lines = [
    `# Generated from Midscene Studio Recorder: ${session.name}`,
    `${session.target.platformId}:`,
  ];

  const targetValues = Object.entries(session.target.values);
  if (targetValues.length > 0) {
    for (const [key, value] of targetValues) {
      lines.push(`  ${key}: ${scalarToYaml(value)}`);
    }
  } else {
    lines.push('  # No target metadata recorded');
  }

  lines.push(
    '',
    'tasks:',
    `  - name: ${scalarToYaml(session.name)}`,
    '    flow:',
  );
  if (session.events.length === 0) {
    lines.push('      - aiAssert: "Recording has no events yet"');
  } else {
    for (const event of session.events) {
      lines.push(...eventToYamlFlow(event));
    }
  }

  return `${lines.join('\n')}\n`;
}

export function generateStudioRecorderMarkdownReplay(
  session: StudioRecordingSession,
  options: {
    screenshotBaseDir?: string;
  } = {},
) {
  const screenshotBaseDir = options.screenshotBaseDir || './screenshots';
  const { assetByHashId } = screenshotAssetMap(session, screenshotBaseDir);
  const lines = [
    `# ${session.name}`,
    '',
    '## Goal',
    'Reproduce the recorded user workflow exactly.',
    '',
    '## Target',
    `- Platform: ${session.target.platformId}`,
    `- Start target: ${targetText(session)}`,
    '',
    '## Replay rules',
    '- Follow the steps in order.',
    '- Do not invent alternative navigation paths.',
    '- If a referenced target cannot be found, stop and report the missing step.',
    '',
    '## Steps',
  ];

  if (session.events.length === 0) {
    lines.push('1. Stop. This recording has no events to replay.');
  } else {
    session.events.forEach((event, index) => {
      lines.push(`${index + 1}. ${stepText(event)}`);
      const screenshotPath = assetByHashId.get(event.hashId);
      if (screenshotPath) {
        lines.push(`   ![step context](${screenshotPath})`);
      }
    });
  }

  return `${lines.join('\n')}\n`;
}

export function generateStudioRecorderPlaywright(
  session: StudioRecordingSession,
) {
  if (session.target.platformId !== 'web') {
    return null;
  }

  const url = String(session.target.values.url || '');
  const lines = [
    "import { test, expect } from '@playwright/test';",
    '',
    `test(${JSON.stringify(session.name)}, async ({ page }) => {`,
  ];

  if (url) {
    lines.push(`  await page.goto(${JSON.stringify(url)});`);
  }

  for (const event of session.events) {
    const description = eventDescription(event);
    switch (event.type) {
      case 'click':
        lines.push(`  // ${description}`);
        lines.push(
          `  await page.mouse.click(${event.elementRect?.x ?? 0}, ${
            event.elementRect?.y ?? 0
          });`,
        );
        break;
      case 'input':
        lines.push(`  // ${description}`);
        lines.push(
          `  await page.keyboard.type(${JSON.stringify(event.value || '')});`,
        );
        break;
      case 'keydown':
        lines.push(
          `  await page.keyboard.press(${JSON.stringify(event.value || '')});`,
        );
        break;
      case 'navigation':
        if (event.actionType === 'GoBack') {
          lines.push('  await page.goBack();');
        } else if (event.actionType === 'GoForward') {
          lines.push('  await page.goForward();');
        } else if (event.actionType === 'Reload') {
          lines.push('  await page.reload();');
        } else if (event.url) {
          lines.push(`  await page.goto(${JSON.stringify(event.url)});`);
        } else {
          lines.push(`  // ${description}`);
        }
        break;
      default:
        lines.push(`  // ${description}`);
    }
  }

  lines.push('  await expect(page).toBeDefined();', '});', '');
  return lines.join('\n');
}

export async function createStudioRecorderZipBase64(
  sessions: StudioRecordingSession[],
) {
  const zip = new JSZip();
  zip.file('recordings.md', generateStudioRecorderMarkdown(sessions));
  for (const session of sessions) {
    const baseName = `${sanitizeFileName(session.name)}-${session.id}`;
    const markdownScreenshotBaseDir = `./${baseName}/screenshots`;
    const markdown =
      session.generatedCode?.markdown ||
      generateStudioRecorderMarkdownReplay(session, {
        screenshotBaseDir: markdownScreenshotBaseDir,
      });
    zip.file(
      `markdown/${baseName}.md`,
      rewriteMarkdownScreenshotBaseDir(markdown, markdownScreenshotBaseDir),
    );
    addMarkdownScreenshotAssetsToZip(zip, session, {
      screenshotBaseDir: markdownScreenshotBaseDir,
      zipPrefix: 'markdown/',
    });
    zip.file(
      `${baseName}.yaml`,
      session.generatedCode?.yaml || generateStudioRecorderYaml(session),
    );
    const playwright =
      session.generatedCode?.playwright ||
      generateStudioRecorderPlaywright(session);
    if (playwright) {
      zip.file(`${baseName}.spec.ts`, playwright);
    }
  }
  return zip.generateAsync({ type: 'base64' });
}

export async function createStudioRecorderMarkdownZipBase64(
  session: StudioRecordingSession,
) {
  const zip = new JSZip();
  const markdown =
    session.generatedCode?.markdown ||
    generateStudioRecorderMarkdownReplay(session);
  zip.file('recording.md', markdown);
  addMarkdownScreenshotAssetsToZip(zip, session, {
    screenshotBaseDir: './screenshots',
  });
  return zip.generateAsync({ type: 'base64' });
}

export async function saveStudioRecorderFile(options: {
  defaultFileName: string;
  content: string;
  filters: SaveFileFilter[];
  title: string;
  encoding?: 'utf-8' | 'base64';
}) {
  let shell: Pick<ElectronShellApi, 'chooseFileSavePath' | 'writeFile'>;
  try {
    shell = getElectronShell();
  } catch {
    triggerBrowserDownload(options);
    return;
  }

  try {
    const path = await shell.chooseFileSavePath({
      title: options.title,
      defaultFileName: options.defaultFileName,
      filters: options.filters,
    });
    if (!path) {
      return;
    }
    await shell.writeFile({
      path,
      content: options.content,
      encoding: options.encoding || 'utf-8',
    });
  } catch (error) {
    if (isMissingGenericFileBridgeError(error)) {
      triggerBrowserDownload(options);
      return;
    }
    throw error;
  }
}

export function getStudioRecorderExportFileName(
  session: StudioRecordingSession,
  extension: string,
) {
  return `${sanitizeFileName(session.name)}.${extension}`;
}
