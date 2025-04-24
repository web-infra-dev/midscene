import fs from 'node:fs';
import path from 'node:path';

const apiText = fs.readFileSync(path.join(__dirname, 'API.mdx'), 'utf-8');
const playwrightExample = fs.readFileSync(
  path.join(__dirname, 'playwright-example.txt'),
  'utf-8',
);

export const PROMPTS = {
  PLAYWRIGHT_CODE_EXAMPLE: playwrightExample,
  MIDSCENE_API_DOCS: apiText,
};
