import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import {
  type DatasetRow,
  loadCases,
  loadManifest,
} from '../evaluation/runtime/load-data.js';
import { casesDir, datasetDir } from '../evaluation/runtime/paths.js';

const PRIMARY_FACTOR_QUOTAS = {
  element: 20,
  unfamiliar: 5,
  small: 10,
  color: 5,
  functional: 20,
  reasoning: 20,
  fine: 5,
  relative: 5,
  disambiguation: 5,
  refusal: 5,
} satisfies Record<DatasetRow['primary_factor'], number>;

export function validateComposition(manifest: DatasetRow[]) {
  if (manifest.length !== 200)
    throw new Error('Expected the fixed 200-case dataset');
  const counts: Record<string, number> = {};
  const factorCounts: Record<string, number> = {};
  for (const row of manifest) {
    if (
      !['web', 'mobile'].includes(row.platform) ||
      !Object.hasOwn(PRIMARY_FACTOR_QUOTAS, row.primary_factor)
    )
      throw new Error(`Invalid primary factor/platform: ${row.case_name}`);
    const category =
      row.primary_factor === 'reasoning'
        ? 'reason'
        : row.primary_factor === 'functional' ||
            row.primary_factor === 'refusal'
          ? row.primary_factor
          : 'basic';
    if (row.task_class !== category)
      throw new Error(`Primary factor/category mismatch: ${row.case_name}`);
    const key = `${row.platform}/${row.task_class}`;
    counts[key] = (counts[key] || 0) + 1;
    const factorKey = `${row.platform}/${row.primary_factor}`;
    factorCounts[factorKey] = (factorCounts[factorKey] || 0) + 1;
  }
  for (const platform of ['web', 'mobile']) {
    for (const [factor, count] of Object.entries(PRIMARY_FACTOR_QUOTAS)) {
      if (factorCounts[`${platform}/${factor}`] !== count)
        throw new Error(`Wrong primary composition: ${platform}/${factor}`);
    }
  }
  return { counts, factorCounts };
}

export async function validateDataset() {
  const [cases, manifest] = await Promise.all([loadCases(), loadManifest()]);
  const indexHashes: Record<string, string> = JSON.parse(
    await readFile(path.join(datasetDir, 'case-index-hashes.json'), 'utf8'),
  );
  if (cases.length !== 200 || manifest.length !== 200)
    throw new Error('Expected the fixed 200-case dataset');
  const { counts, factorCounts } = validateComposition(manifest);
  const seenImages = new Set<string>();
  const rows = new Map(manifest.map((row) => [row.case_name, row]));
  for (const item of cases) {
    const row = rows.get(item.caseName)!;
    const index = await readFile(
      path.join(casesDir, item.caseName, 'index.json'),
    );
    if (
      createHash('sha256').update(index).digest('hex') !==
      indexHashes[item.caseName]
    )
      throw new Error(`Changed query/GT/index: ${item.caseName}`);
    if (JSON.parse(index.toString()).primaryFactor !== row.primary_factor)
      throw new Error(
        `Manifest/index primary factor mismatch: ${item.caseName}`,
      );
    const data = await readFile(
      path.join(casesDir, item.caseName, item.images[0].fileName),
    );
    const hash = createHash('sha256').update(data).digest('hex');
    if (hash !== row.image_sha256 || seenImages.has(hash))
      throw new Error(`Changed or duplicate screenshot: ${item.caseName}`);
    seenImages.add(hash);
    const metadata = await sharp(data).metadata();
    if (metadata.width !== row.width || metadata.height !== row.height)
      throw new Error(`Changed image size: ${item.caseName}`);
    if (row.bbox_xyxy) {
      const [x1, y1, x2, y2] = row.bbox_xyxy;
      if (
        x1 < 0 ||
        y1 < 0 ||
        x1 >= x2 ||
        y1 >= y2 ||
        x2 > row.width ||
        y2 > row.height
      )
        throw new Error(`Out-of-bounds or empty GT: ${item.caseName}`);
    }
  }
  return {
    cases: cases.length,
    screenshots: seenImages.size,
    counts,
    factorCounts,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  console.log(JSON.stringify(await validateDataset(), null, 2));
}
