import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MidsceneResultsFileData } from '../evaluation/midscene/types.js';
import { buildSingleReportPage } from '../evaluation/report-page/build-with-rsbuild.js';
const resultsPath = process.argv[2];
if (!resultsPath) throw new Error('Usage: pnpm report /path/to/results.json');
const result: MidsceneResultsFileData = JSON.parse(
  await readFile(path.resolve(resultsPath), 'utf8'),
);
const reportFilePath = path.join(
  path.dirname(path.resolve(resultsPath)),
  'report.html',
);
await buildSingleReportPage({ resultsData: result, reportFilePath });
console.log(reportFilePath);
