import { PLAYWRIGHT_EXAMPLE_CODE } from '@midscene/shared/constants';
import fs from 'node:fs';
import path from 'node:path';

const apiText = fs.readFileSync(path.join(__dirname, 'API.mdx'), 'utf-8');

export const PROMPTS = {
  PLAYWRIGHT_CODE_EXAMPLE: PLAYWRIGHT_EXAMPLE_CODE,
  MIDSCENE_API_DOCS: apiText,
};
