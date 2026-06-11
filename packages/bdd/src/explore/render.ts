/**
 * Render an ExploreModel into the self-contained dashboard HTML document.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ERROR_PREFIX } from '../types';
import type { ExploreModel } from './model';

const DATA_PLACEHOLDER = '__EXPLORE_MODEL_PLACEHOLDER__';
const TEMPLATE_OVERRIDE_ENV = 'MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH';
const TEMPLATE_RELATIVE_PATH = path.join('static', 'dashboard-template.html');

function resolveTemplatePath(): string | null {
  const overridePath = process.env[TEMPLATE_OVERRIDE_ENV];
  if (overridePath) {
    const absoluteOverride = path.resolve(overridePath);
    return fs.existsSync(absoluteOverride) ? absoluteOverride : null;
  }

  let currentDir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(currentDir, TEMPLATE_RELATIVE_PATH);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
}

function readDashboardTemplate(): string {
  const templatePath = resolveTemplatePath();
  if (!templatePath) {
    throw new Error(
      `${ERROR_PREFIX} Dashboard template missing (${TEMPLATE_RELATIVE_PATH}). Build it first: npx nx build bdd-dashboard`,
    );
  }

  return fs.readFileSync(templatePath, 'utf-8');
}

export function renderDashboard(model: ExploreModel): string {
  // Escaping every '<' as \u003c keeps the JSON inert inside the script tag
  // (covers '</script>' and '<!--' alike); JSON.parse undoes it losslessly.
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  const template = readDashboardTemplate();
  if (!template.includes(DATA_PLACEHOLDER)) {
    throw new Error(
      `${ERROR_PREFIX} Dashboard template is missing the ${DATA_PLACEHOLDER} placeholder`,
    );
  }
  // Replacement callback: '$'-sequences in the JSON must stay literal.
  return template.replace(DATA_PLACEHOLDER, () => json);
}
