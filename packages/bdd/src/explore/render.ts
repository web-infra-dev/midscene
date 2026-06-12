/**
 * Render an ExploreModel into the self-contained dashboard HTML document.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ERROR_PREFIX } from '../types';
import type { ExploreModel } from './model';

const DATA_PLACEHOLDER = '__EXPLORE_MODEL_PLACEHOLDER__';
// The inlined JS bundle also contains the placeholder as a quoted string
// (the viewer compares against it for its dev fallback), so injection must
// anchor on the JSON script tag's `>...</script>` form, never bare.
const ANCHORED_PLACEHOLDER = `>${DATA_PLACEHOLDER}</script>`;
const TEMPLATE_OVERRIDE_ENV = 'MIDSCENE_BDD_DASHBOARD_TEMPLATE_PATH';
const TEMPLATE_RELATIVE_PATH = path.join('static', 'dashboard-template.html');

function isBddPackageRoot(dir: string): boolean {
  const packageJsonPath = path.join(dir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return parsed.name === '@midscene/bdd';
  } catch {
    // dist subdirs ship marker package.json files; unparseable ones are not
    // the package root.
    return false;
  }
}

function resolveTemplatePath(): string {
  const overridePath = process.env[TEMPLATE_OVERRIDE_ENV];
  if (overridePath) {
    const absoluteOverride = path.resolve(overridePath);
    if (!fs.existsSync(absoluteOverride)) {
      throw new Error(
        `${ERROR_PREFIX} ${TEMPLATE_OVERRIDE_ENV} points to a missing file: ${absoluteOverride}`,
      );
    }
    return absoluteOverride;
  }

  // Walk up from the compiled module (dist/{lib,es}/explore or src/explore),
  // but never past the @midscene/bdd package root — a stray template in a
  // consumer project or the monorepo root must not be picked up.
  let currentDir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(currentDir, TEMPLATE_RELATIVE_PATH);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (isBddPackageRoot(currentDir)) {
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  throw new Error(
    `${ERROR_PREFIX} Dashboard template missing (${TEMPLATE_RELATIVE_PATH}). Build it first: npx nx build bdd-dashboard`,
  );
}

export function renderDashboard(model: ExploreModel): string {
  // Escaping every '<' as \u003c keeps the JSON inert inside the script tag
  // (covers '</script>' and '<!--' alike); JSON.parse undoes it losslessly.
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  const template = fs.readFileSync(resolveTemplatePath(), 'utf-8');
  if (!template.includes(ANCHORED_PLACEHOLDER)) {
    throw new Error(
      `${ERROR_PREFIX} Dashboard template is missing the ${DATA_PLACEHOLDER} placeholder inside its JSON script tag`,
    );
  }
  // Replacement callback: '$'-sequences in the JSON must stay literal.
  return template.replace(ANCHORED_PLACEHOLDER, () => `>${json}</script>`);
}
