import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeScriptTag } from '@midscene/shared/utils';

const reportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const templatePath = path.join(reportRoot, 'dist/index.html');
const fixturePath = path.join(reportRoot, 'test-data/multi-model.json');
const outputPath = path.join(reportRoot, 'examples/mobile-report.html');

const template = fs.readFileSync(templatePath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!template.includes('</body>')) {
  throw new Error(`Report template has no closing body tag: ${templatePath}`);
}
if (
  !Array.isArray(fixture.dump?.executions) ||
  !fixture.dump.executions.length
) {
  throw new Error(`Example fixture contains no executions: ${fixturePath}`);
}

const images = Object.entries(fixture.images).map(([id, dataUri]) => {
  if (!/^[a-f0-9]+$/i.test(id) || typeof dataUri !== 'string') {
    throw new Error(`Invalid screenshot in example fixture: ${id}`);
  }
  return `<script type="midscene-image" data-id="${id}">${escapeScriptTag(dataUri)}</script>`;
});
const dump = `<script type="midscene_web_dump" data-group-id="mobile-report-example" playwright_test_title="Mobile report example" playwright_test_status="passed" playwright_test_duration="1000">${escapeScriptTag(JSON.stringify(fixture.dump))}</script>`;
const html = template.replace(
  '</body>',
  `${images.join('\n')}\n${dump}\n</body>`,
);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Generated ${outputPath} (${Buffer.byteLength(html)} bytes)`);
