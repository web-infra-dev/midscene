import type { Size, UITreeSnapshot, UiNode } from '@midscene/core';
import { sleep } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import type { ADB } from 'appium-adb';
import { runAdbShellStdoutOrThrow } from './adb-shell';
import {
  ANDROID_UI_TREE_XPATH_POLICY,
  uiautomatorXmlToUiNode,
} from './ui-tree';

const ACCESSIBILITY_DUMP_ATTEMPTS = 3;
const ACCESSIBILITY_DUMP_TIMEOUT_MS = 5_000;
const ACCESSIBILITY_DUMP_RETRY_DELAY_MS = 250;
const YADB_LAYOUT_PATH = '/data/local/tmp/midscene_yadb_layout_dump.xml';
const UIAUTOMATOR_LAYOUT_PATH = '/sdcard/midscene_window_dump.xml';

type AndroidAccessibilityTreeSource = 'yadb' | 'uiautomator';

interface AndroidUITreeCaptureOptions {
  adb: ADB;
  devicePixelRatio: number;
  displayId?: number;
  ensureYadb: () => Promise<void>;
  getDisplaySize: () => Promise<Size>;
}

const debugUITree = getDebug('android:ui-tree');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateHierarchyXml(
  xml: unknown,
  source: AndroidAccessibilityTreeSource,
): asserts xml is string {
  if (
    typeof xml !== 'string' ||
    !/<hierarchy(?:\s|>)/.test(xml) ||
    !xml.includes('</hierarchy>')
  ) {
    throw new Error(`${source} did not produce valid hierarchy XML`);
  }
}

function focusedPackageForLogicalDisplay(
  windowDump: string,
  logicalDisplayId: number,
): string | null {
  const displayMatches = [
    ...windowDump.matchAll(/^\s*Display: mDisplayId=(\d+)\b.*$/gm),
  ];
  const displayIndex = displayMatches.findIndex(
    (match) => Number(match[1]) === logicalDisplayId,
  );
  if (displayIndex === -1) return null;

  const start = displayMatches[displayIndex].index ?? 0;
  const end = displayMatches[displayIndex + 1]?.index ?? windowDump.length;
  const displayBlock = windowDump.slice(start, end);
  for (const field of ['mCurrentFocus', 'mFocusedApp']) {
    const value = displayBlock.match(
      new RegExp(`^\\s*${field}=([^\\n]*)$`, 'm'),
    )?.[1];
    const packageName = value?.match(/\bu\d+\s+([A-Za-z0-9_$.-]+)\//)?.[1];
    if (packageName) return packageName;
  }
  return null;
}

function firstTreePackage(root: UiNode): string | null {
  if (root.attrs.package) return root.attrs.package;
  for (const child of root.children) {
    const packageName = firstTreePackage(child);
    if (packageName) return packageName;
  }
  return null;
}

function windowDisplayIdsForPackage(
  windowDump: string,
  packageName: string,
): number[] {
  const windowMatches = [
    ...windowDump.matchAll(/^\s*Window #\d+ Window\{.*$/gm),
  ];
  const displayIds = new Set<number>();

  for (let index = 0; index < windowMatches.length; index++) {
    const start = windowMatches[index].index ?? 0;
    const end = windowMatches[index + 1]?.index ?? windowDump.length;
    const windowBlock = windowDump.slice(start, end);
    const ownerPackage = windowBlock.match(
      /^\s*mOwnerUid=.*\bpackage=([A-Za-z0-9_$.-]+)\b/m,
    )?.[1];
    const headerPackage = windowMatches[index][0].match(
      /\bu\d+\s+([A-Za-z0-9_$.-]+)\//,
    )?.[1];
    if (ownerPackage !== packageName && headerPackage !== packageName) {
      continue;
    }

    const displayId = windowBlock.match(/^\s*mDisplayId=(\d+)\b/m)?.[1];
    if (displayId !== undefined) displayIds.add(Number(displayId));
  }

  return [...displayIds];
}

function uiTreeExtent(root: UiNode): { right: number; bottom: number } {
  let right = root.bounds.left + root.bounds.width;
  let bottom = root.bounds.top + root.bounds.height;
  for (const child of root.children) {
    const childExtent = uiTreeExtent(child);
    right = Math.max(right, childExtent.right);
    bottom = Math.max(bottom, childExtent.bottom);
  }
  return { right, bottom };
}

async function dumpAccessibilityXml(
  adb: ADB,
  source: AndroidAccessibilityTreeSource,
  ensureYadb: () => Promise<void>,
): Promise<string> {
  const destination =
    source === 'yadb' ? YADB_LAYOUT_PATH : UIAUTOMATOR_LAYOUT_PATH;

  if (source === 'yadb') {
    await ensureYadb();
  }

  await runAdbShellStdoutOrThrow(adb, `rm -f ${destination}`, {
    timeout: ACCESSIBILITY_DUMP_TIMEOUT_MS,
  });
  const command =
    source === 'yadb'
      ? `app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -layout ${destination}`
      : `uiautomator dump --compressed ${destination}`;
  await runAdbShellStdoutOrThrow(adb, command, {
    timeout: ACCESSIBILITY_DUMP_TIMEOUT_MS,
  });
  const xml = await runAdbShellStdoutOrThrow(adb, `cat ${destination}`, {
    timeout: ACCESSIBILITY_DUMP_TIMEOUT_MS,
  });
  validateHierarchyXml(xml, source);
  return xml;
}

async function validateUITreeDisplay(
  root: UiNode,
  options: Pick<
    AndroidUITreeCaptureOptions,
    'adb' | 'displayId' | 'getDisplaySize'
  >,
): Promise<void> {
  if (typeof options.displayId !== 'number') return;

  const { adb, displayId } = options;
  const displayWindowDump = await runAdbShellStdoutOrThrow(
    adb,
    'dumpsys window displays',
    { timeout: ACCESSIBILITY_DUMP_TIMEOUT_MS },
  );
  const expectedPackage = focusedPackageForLogicalDisplay(
    displayWindowDump,
    displayId,
  );
  const treePackage = firstTreePackage(root);
  if (!expectedPackage) {
    throw new Error(
      `Unable to verify Android UI tree display alignment for displayId=${displayId}: no focused package found on the target display`,
    );
  }
  if (!treePackage) {
    throw new Error(
      `Unable to verify Android UI tree display alignment for displayId=${displayId}: accessibility hierarchy has no package`,
    );
  }

  const allWindowDump = await runAdbShellStdoutOrThrow(
    adb,
    'dumpsys window windows',
    { timeout: ACCESSIBILITY_DUMP_TIMEOUT_MS },
  );
  const treePackageDisplayIds = windowDisplayIdsForPackage(
    allWindowDump,
    treePackage,
  );
  if (treePackageDisplayIds.length === 0) {
    throw new Error(
      `Unable to verify Android UI tree display alignment for displayId=${displayId}: no window display ownership found for accessibility package ${treePackage}`,
    );
  }
  if (!treePackageDisplayIds.includes(displayId)) {
    throw new Error(
      `Android UI tree display mismatch for displayId=${displayId}: expected focused package ${expectedPackage}, but accessibility hierarchy belongs to ${treePackage} on displayId=${treePackageDisplayIds.join(',')}`,
    );
  }

  const targetSize = await options.getDisplaySize();
  const extent = uiTreeExtent(root);
  const tolerance = 1;
  if (
    extent.right > targetSize.width + tolerance ||
    extent.bottom > targetSize.height + tolerance
  ) {
    throw new Error(
      `Android UI tree bounds exceed displayId=${displayId}: tree ${Math.round(extent.right)}x${Math.round(extent.bottom)} is outside target ${targetSize.width}x${targetSize.height}`,
    );
  }
}

export async function captureAndroidUITree(
  options: AndroidUITreeCaptureOptions,
): Promise<UITreeSnapshot> {
  const sources: AndroidAccessibilityTreeSource[] =
    (options.displayId ?? 0) === 0 ? ['yadb', 'uiautomator'] : ['uiautomator'];
  const failures: string[] = [];

  for (let attempt = 1; attempt <= ACCESSIBILITY_DUMP_ATTEMPTS; attempt++) {
    const source = sources[Math.min(attempt - 1, sources.length - 1)];
    const startedAt = Date.now();
    try {
      const xml = await dumpAccessibilityXml(
        options.adb,
        source,
        options.ensureYadb,
      );
      const capturedAt = Date.now();
      const root = uiautomatorXmlToUiNode(xml, options.devicePixelRatio);
      await validateUITreeDisplay(root, options);
      debugUITree(
        'capture source=%s attempt=%d durationMs=%d bytes=%d',
        source,
        attempt,
        Date.now() - startedAt,
        xml.length,
      );
      return {
        platform: 'android',
        capturedAt,
        root,
        xpathPolicy: {
          ...ANDROID_UI_TREE_XPATH_POLICY,
          stableAttrs: [...ANDROID_UI_TREE_XPATH_POLICY.stableAttrs],
          textAttrs: [...ANDROID_UI_TREE_XPATH_POLICY.textAttrs],
          excludedTargetTypes: [
            ...ANDROID_UI_TREE_XPATH_POLICY.excludedTargetTypes,
          ],
        },
      };
    } catch (error) {
      const failure = `${source} attempt ${attempt}/${ACCESSIBILITY_DUMP_ATTEMPTS}: ${errorMessage(error)}`;
      failures.push(failure);
      debugUITree(
        'capture failed source=%s attempt=%d/%d durationMs=%d error=%s',
        source,
        attempt,
        ACCESSIBILITY_DUMP_ATTEMPTS,
        Date.now() - startedAt,
        errorMessage(error),
      );
      if (attempt < ACCESSIBILITY_DUMP_ATTEMPTS) {
        await sleep(ACCESSIBILITY_DUMP_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `Unable to capture Android UI tree after ${failures.length} attempt(s): ${failures.join('; ')}`,
  );
}
