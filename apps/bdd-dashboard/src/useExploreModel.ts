import type { ExploreModel } from '@midscene/bdd';
import sampleExploreModel from './fixtures/example-explore-model.json';

const MODEL_ELEMENT_ID = 'midscene-bdd-explore-model';
const DATA_PLACEHOLDER = '__EXPLORE_MODEL_PLACEHOLDER__';

const devModel = sampleExploreModel as ExploreModel;

function parseExploreModel(raw: string): ExploreModel {
  try {
    return JSON.parse(raw) as ExploreModel;
  } catch (error) {
    throw new Error(
      `[midscene-bdd] Failed to parse injected ExploreModel JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function useExploreModel(): ExploreModel {
  const modelElement = document.getElementById(MODEL_ELEMENT_ID);
  const isDev = import.meta.env.DEV;

  if (!modelElement) {
    if (isDev) {
      return devModel;
    }
    throw new Error(
      `[midscene-bdd] Missing #${MODEL_ELEMENT_ID} script tag in dashboard template`,
    );
  }

  const raw = modelElement.textContent?.trim() ?? '';
  if (!raw || raw === DATA_PLACEHOLDER) {
    if (isDev) {
      return devModel;
    }
    throw new Error(
      '[midscene-bdd] ExploreModel payload was not injected. Generate the dashboard via "midscene-bdd dashboard".',
    );
  }

  return parseExploreModel(raw);
}
