import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { MidsceneEvaluationPlan } from './types.js';

export function sanitizeResult<T>(value: T, secrets: string[]): T {
  const text = JSON.stringify(value, (key, item) =>
    /api[_-]?key|authorization|password|access[_-]?token|secret/i.test(key)
      ? undefined
      : item,
  );
  let clean = text;
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    for (const encoded of [
      JSON.stringify(secret).slice(1, -1),
      encodeURIComponent(secret),
    ]) {
      clean = clean.split(encoded).join('[REDACTED]');
    }
  }
  return JSON.parse(clean) as T;
}

export async function snapshotBenchmarkImages(
  plan: MidsceneEvaluationPlan,
  runDir: string,
) {
  const paths = new Map<string, string>();
  await mkdir(path.join(runDir, 'images'), { recursive: true });
  for (const item of plan.items) {
    const key = JSON.stringify([item.caseName, item.imageFileName]);
    let relative = paths.get(key);
    if (!relative) {
      relative = `images/${paths.size}${path.extname(item.imageFileName)}`;
      await copyFile(item.screenshotPath, path.join(runDir, relative));
      paths.set(key, relative);
    }
    item.screenshotPath = path.join(runDir, relative);
  }
  return paths;
}
