import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataset = path.join(root, '_data/dataset');
const factorLabels = {
  'Element basic': 'Basic Element',
  'Unfamiliar Icon': 'Specialized Icon',
};
const displayFactorLabel = (label) => factorLabels[label] || label;
const names = JSON.parse(
  await readFile(path.join(dataset, 'case_names.json'), 'utf8'),
).sort();
const manifest = (await readFile(path.join(dataset, 'manifest.jsonl'), 'utf8'))
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const rows = await Promise.all(
  names.map(async (name) => {
    const row = manifest.find((item) => item.case_name === name);
    if (!row) {
      throw new Error(`Missing manifest entry: ${name}`);
    }
    const index = JSON.parse(
      await readFile(
        path.join(root, '_data/cases', name, 'index.json'),
        'utf8',
      ),
    );
    const shot = index.images.find((item) => item.imageType === 'hd');
    if (!shot) {
      throw new Error(`Missing HD image: ${name}`);
    }
    return {
      ...row,
      primary_factor_label: displayFactorLabel(row.primary_factor_label),
      secondary_factors: row.secondary_factors?.map(displayFactorLabel),
      query: index.prompt,
      bbox_xyxy: shot.gtBox,
      image: `../../_data/cases/${name}/${shot.fileName}`,
    };
  }),
);
const template = await readFile(
  path.join(root, 'dashboard/case-browser/index.html'),
  'utf8',
);
const html = template.replace(
  '__CASE_DATA__',
  JSON.stringify(rows).replaceAll('<', '\\u003c'),
);
const output = path.join(root, 'output/case-browser/index.html');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
console.log(`题库浏览页：${output}（${rows.length} 题）`);

if (process.argv.includes('--serve')) {
  const assets = new Map(
    rows.map((row) => {
      const absolute = path.resolve(path.dirname(output), row.image);
      return [
        `/${path.relative(root, absolute).split(path.sep).join('/')}`,
        absolute,
      ];
    }),
  );
  assets.set('/', output);
  assets.set('/output/case-browser/index.html', output);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
      const file = assets.get(pathname);
      if (!file) {
        response.writeHead(404).end('Not found');
        return;
      }
      const type = file.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : file.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg';
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-cache',
      });
      response.end(bytes);
    } catch (error) {
      console.error(error);
      response.writeHead(500).end('Unable to read case');
    }
  });
  server.listen(4318, '127.0.0.1', () => {
    console.log('打开 http://127.0.0.1:4318/output/case-browser/index.html');
  });
}
