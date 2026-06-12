import sampleExploreModel from './fixtures/example-explore-model.json';
import type { ExploreModel } from './model/types';

const MODEL_ELEMENT_ID = 'midscene-bdd-explore-model';
const DATA_PLACEHOLDER = '__EXPLORE_MODEL_PLACEHOLDER__';

// The JSON literal type is narrower than the model contract (string-literal
// unions, sparse optionals), so widen through unknown.
const devModel = sampleExploreModel as unknown as ExploreModel;

function parseExploreModel(raw: string): ExploreModel {
  try {
    return JSON.parse(raw) as ExploreModel;
  } catch (error) {
    // Mirrors ERROR_PREFIX in @midscene/bdd (no runtime dep by design).
    throw new Error(
      `[midscene-bdd] Failed to parse injected ExploreModel JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function loadExploreModel(): ExploreModel {
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

// The payload is static for the page's lifetime; parse exactly once so the
// model keeps one object identity and downstream memos never re-fire.
let cachedModel: ExploreModel | null = null;

export function readExploreModel(): ExploreModel {
  if (!cachedModel) {
    cachedModel = loadExploreModel();
  }
  return cachedModel;
}
