import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
test('standalone browser sorts case IDs and preserves every runtime query, GT and local screenshot', async () => {
  execFileSync(process.execPath, ['scripts/browse-cases.mjs'], { cwd: root });
  const output = path.join(root, 'output/case-browser/index.html');
  const html = await readFile(output, 'utf8');
  const embedded = html.match(
    /<script id="case-data" type="application\/json">([\s\S]*?)<\/script>/,
  );
  assert.ok(embedded);
  const rows = JSON.parse(embedded[1]);
  const names = JSON.parse(
    await readFile(path.join(root, '_data/dataset/case_names.json'), 'utf8'),
  );
  assert.equal(rows.length, 200);
  assert.deepEqual(
    rows.map((row) => row.case_name),
    [...names].sort(),
  );
  assert.equal(rows.filter((row) => row.bbox_xyxy === null).length, 10);
  await Promise.all(
    rows.map(async (row) => {
      const index = JSON.parse(
        await readFile(
          path.join(root, '_data/cases', row.case_name, 'index.json'),
          'utf8',
        ),
      );
      assert.equal(row.query, index.prompt);
      assert.deepEqual(row.bbox_xyxy, index.images[0].gtBox);
      await access(path.resolve(path.dirname(output), row.image));
      assert.ok(row.width > 0 && row.height > 0);
    }),
  );
  const code = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(code);
  new Script(code[1]);
});
