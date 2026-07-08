/**
 * Extract a specific test's data from a generated Midscene HTML report
 * and save it as a test-data JSON file for the report dev server.
 *
 * Usage:
 *   npx tsx scripts/extract-test-data-from-html.ts \
 *     --html packages/harmony/midscene_run/report/harmony-2026-07-07_20-15-31-2de68514.html \
 *     --output apps/report/test-data/harmonyos-observer.json \
 *     --filter "observed-frame"
 *
 * --filter: only include executions whose tasks contain recorder items
 *           with this timing value (e.g. "observed-frame"). Omit to include all.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseImageScripts } from '../../../packages/core/src/dump/html-utils';
import { restoreImageReferences } from '../../../packages/core/src/dump/screenshot-restoration';

// --- arg parsing ---
function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const htmlPath = getArg('html');
const outputPath = getArg('output');
const filter = getArg('filter');

if (!htmlPath || !outputPath) {
  console.error(
    'Usage: extract-test-data-from-html.ts --html <path> --output <path> [--filter <timing>]',
  );
  process.exit(1);
}

console.log(`Reading HTML report: ${htmlPath}`);
const html = readFileSync(htmlPath, 'utf-8');

// --- parse inline images ---
const imageMap = parseImageScripts(html);
console.log(`Found ${Object.keys(imageMap).length} inline images`);

// --- parse dump scripts ---
const dumpRegex =
  /<script type="midscene_web_dump"([^>]*)>([\s\S]*?)<\/script>/g;

interface DumpEntry {
  attrs: Record<string, string>;
  data: any;
}

const dumps: DumpEntry[] = [];
for (const match of html.matchAll(dumpRegex)) {
  const [, attrStr, content] = match;
  const attrs: Record<string, string> = {};
  for (const attrMatch of attrStr.matchAll(/(\w[\w-]+)="([^"]*)"/g)) {
    attrs[attrMatch[1]] = attrMatch[2];
  }
  try {
    const data = JSON.parse(content);
    dumps.push({ attrs, data });
  } catch {
    // skip unparseable
  }
}

console.log(`Found ${dumps.length} dump scripts`);

// --- resolve image references in each dump ---
const resolveImage = (ref: {
  id: string;
  storage?: string;
  path?: string;
}): string => {
  const cached = imageMap[ref.id];
  if (cached) return cached;
  if (ref.storage === 'file' && ref.path) return ref.path;
  return `./screenshots/${ref.id}.png`;
};

for (const dump of dumps) {
  dump.data = restoreImageReferences(dump.data, resolveImage);
}

// --- filter executions ---
interface ExecutionInfo {
  name: string;
  taskCount: number;
  hasFilteredTiming: boolean;
}

const allExecutions: ExecutionInfo[] = [];
for (const dump of dumps) {
  const execs = Array.isArray(dump.data)
    ? dump.data
    : (dump.data.executions ?? [dump.data]);
  for (const exec of execs) {
    if (!exec?.tasks) continue;
    const hasFilteredTiming = exec.tasks.some((t: any) =>
      (t.recorder ?? []).some((r: any) => !filter || r.timing === filter),
    );
    allExecutions.push({
      name: exec.name ?? 'unnamed',
      taskCount: exec.tasks?.length ?? 0,
      hasFilteredTiming,
    });
  }
}

console.log('\nAll executions:');
allExecutions.forEach((e, i) => {
  console.log(
    `  ${i}: [${e.hasFilteredTiming ? '✓' : ' '}] ${e.name} (${e.taskCount} tasks)`,
  );
});

// Build the output: include executions matching the filter, or all if no filter.
// When filtering, take only the LAST occurrence of each matching execution name.
const selectedExecutions: any[] = [];
let sdkVersion = '1.0.3';
let deviceType: string | undefined;
let platform: string | undefined;

// Collect all executions first
const allExecObjs: { exec: any; dumpData: any }[] = [];
for (const dump of dumps) {
  const execs = Array.isArray(dump.data)
    ? dump.data
    : (dump.data.executions ?? [dump.data]);

  if (dump.data.sdkVersion) sdkVersion = dump.data.sdkVersion;
  if (dump.data.deviceType) deviceType = dump.data.deviceType;
  if (dump.data.platform) platform = dump.data.platform;

  for (const exec of execs) {
    if (exec?.tasks) allExecObjs.push({ exec, dumpData: dump.data });
  }
}

if (filter) {
  // Find last occurrence of each execution name that has the filter timing
  const lastMatchByName = new Map<string, number>();
  allExecObjs.forEach((item, i) => {
    const matches = item.exec.tasks.some((t: any) =>
      (t.recorder ?? []).some((r: any) => r.timing === filter),
    );
    if (matches) {
      lastMatchByName.set(item.exec.name, i);
    }
  });

  for (const [name, idx] of lastMatchByName) {
    selectedExecutions.push(allExecObjs[idx].exec);
    console.log(`  Selected last "${name}" at index ${idx}`);
  }
} else {
  for (const item of allExecObjs) {
    selectedExecutions.push(item.exec);
  }
}

console.log(`\nSelected ${selectedExecutions.length} executions`);

// Also include non-observed helper executions that belong to the same test run.
// Strategy: take only the LAST occurrence of each execution name, since the
// target test was the most recent run.
if (filter) {
  const execList = allExecObjs.map((item) => item.exec);

  // Find the LAST occurrence of each execution name
  const lastByName = new Map<string, number>();
  execList.forEach((e, i) => {
    lastByName.set(e.name, i);
  });

  // Collect names of filtered executions
  const filteredNames = new Set<string>();
  for (const exec of selectedExecutions) {
    filteredNames.add(exec.name);
  }

  // For each filtered execution, also include the last occurrence of
  // "helper" executions that likely belong to the same test run.
  // Heuristic: include the last Launch and last HarmonyHomeButton.
  const helperNames = new Set<string>();
  execList.forEach((e) => {
    if (e.name === 'Launch') helperNames.add('Launch');
    if (e.name === 'HarmonyHomeButton') helperNames.add('HarmonyHomeButton');
  });

  const namesToInclude = new Set([...filteredNames, ...helperNames]);
  const finalExecutions: any[] = [];

  for (const name of namesToInclude) {
    const idx = lastByName.get(name);
    if (idx !== undefined) {
      finalExecutions.push(execList[idx]);
    }
  }

  // Sort by original order
  finalExecutions.sort((a, b) => execList.indexOf(a) - execList.indexOf(b));

  selectedExecutions.length = 0;
  selectedExecutions.push(...finalExecutions);

  console.log(
    `After adding helpers (last occurrence only): ${selectedExecutions.length} executions`,
  );
  for (const exec of selectedExecutions) {
    const hasObserved = (exec.tasks ?? []).some((t: any) =>
      (t.recorder ?? []).some((r: any) => r.timing === filter),
    );
    console.log(
      `  [${hasObserved ? '✓' : ' '}] ${exec.name} (${exec.tasks?.length ?? 0} tasks)`,
    );
  }
}

// --- build output object ---
const output = {
  sdkVersion,
  groupName: filter
    ? `HarmonyOS UI Observer Test (${filter})`
    : 'HarmonyOS Test Report',
  groupDescription: 'HarmonyOS',
  modelBriefs: {},
  platform: platform ?? deviceType ?? 'HarmonyOS',
  executions: selectedExecutions,
  ...(deviceType ? { deviceType } : {}),
};

// --- serialize (this triggers lazy base64 getters) ---
console.log('\nSerializing (resolving inline images)...');
const json = JSON.stringify(output);

const sizeMB = (Buffer.byteLength(json, 'utf-8') / 1024 / 1024).toFixed(1);
console.log(`Output size: ${sizeMB} MB`);

writeFileSync(outputPath, json);
console.log(`Saved to: ${outputPath}`);

// --- verify ---
const parsed = JSON.parse(json);
console.log(`\nVerification: ${parsed.executions.length} executions`);
for (const exec of parsed.executions) {
  for (const task of exec.tasks ?? []) {
    for (const rec of task.recorder ?? []) {
      const ss = rec.screenshot;
      if (ss) {
        const isRef =
          typeof ss === 'object' && ss.type === 'midscene_screenshot_ref';
        const isBase64 = typeof ss === 'string' && ss.startsWith('data:');
        const hasBase64 =
          typeof ss === 'object' &&
          typeof ss.base64 === 'string' &&
          ss.base64.startsWith('data:');
        if (isRef) {
          console.error(`  ERROR: unresolved ref in ${exec.name}: ${ss.id}`);
        } else if (isBase64 || hasBase64) {
          // ok
        }
      }
    }
  }
}
console.log('Done.');
