import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { loadCases, loadManifest } from '../evaluation/runtime/load-data.js';
import { casesDir, datasetDir } from '../evaluation/runtime/paths.js';

export async function validateDataset() {
  const [cases, manifest] = await Promise.all([loadCases(), loadManifest()]);
  const indexHashes: Record<string, string> = JSON.parse(
    await readFile(path.join(datasetDir, 'case-index-hashes.json'), 'utf8'),
  );
  if (cases.length !== 200 || manifest.length !== 200)
    throw new Error('Expected the fixed 200-case dataset');
  const counts: Record<string, number> = {};
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
    const key = `${row.platform}/${row.task_class}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const platform of ['web', 'mobile']) {
    for (const [category, count] of Object.entries({
      basic: 30,
      functional: 40,
      reason: 25,
      refusal: 5,
    })) {
      if (counts[`${platform}/${category}`] !== count)
        throw new Error(`Wrong composition: ${platform}/${category}`);
    }
  }
  return { cases: cases.length, screenshots: seenImages.size, counts };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  console.log(JSON.stringify(await validateDataset(), null, 2));
}
