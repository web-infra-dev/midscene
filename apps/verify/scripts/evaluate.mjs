import { readFile, writeFile } from 'node:fs/promises';
import { digest } from '../src/config.mjs';
import { evaluate } from '../src/evaluation.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    'Usage: node scripts/evaluate.mjs observations.json new-result.json',
  );
const corpusText = await readFile(
  new URL('../evaluation/cases.json', import.meta.url),
  'utf8',
);
const inputText = await readFile(input, 'utf8');
const run = JSON.parse(inputText);
const result = {
  corpusDigest: digest(corpusText),
  observationsDigest: digest(inputText),
  run,
  metrics: evaluate(JSON.parse(corpusText), run),
};
await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result.metrics, null, 2));
