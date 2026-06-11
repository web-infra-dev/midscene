/**
 * Render an ExploreModel into the self-contained dashboard HTML document.
 */
import { ERROR_PREFIX } from '../types';
import type { ExploreModel } from './model';
import { DASHBOARD_TEMPLATE } from './template';

const DATA_PLACEHOLDER = '__EXPLORE_DATA__';

export function renderDashboard(model: ExploreModel): string {
  // Escaping every '<' as \u003c keeps the JSON inert inside the script tag
  // (covers '</script>' and '<!--' alike); JSON.parse undoes it losslessly.
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  if (!DASHBOARD_TEMPLATE.includes(DATA_PLACEHOLDER)) {
    throw new Error(
      `${ERROR_PREFIX} Dashboard template is missing the ${DATA_PLACEHOLDER} placeholder`,
    );
  }
  // Replacement callback: '$'-sequences in the JSON must stay literal.
  return DASHBOARD_TEMPLATE.replace(DATA_PLACEHOLDER, () => json);
}
