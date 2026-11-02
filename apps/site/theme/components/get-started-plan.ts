export const scenes = ['playground', 'test', 'sdk'] as const;
export const platforms = [
  'web',
  'android',
  'ios',
  'harmonyos',
  'desktop',
] as const;
export const models = ['chatgpt', 'api-key'] as const;
// Recommended models for the API Key path. Each id is the anchor of the model
// section in model-api-setup.mdx and of its shared card in common/model-cards/.
export const llms = [
  'doubao-seed-model',
  'qwen',
  'deepseek',
  'gemini',
  'gpt',
  'kimi',
  'xiaomi-mimo',
  'glm-v',
  'ant-ling',
] as const;

export type Scene = (typeof scenes)[number];
export type Platform = (typeof platforms)[number];
export type ModelAccess = (typeof models)[number];
export type Llm = (typeof llms)[number];

export interface Selection {
  scene?: Scene;
  platform?: Platform;
  model?: ModelAccess;
  // Only asked for the API Key path. It refines the model step and does not
  // affect which steps are planned.
  llm?: Llm;
}

export type CompleteSelection = Required<
  Pick<Selection, 'scene' | 'platform' | 'model'>
> &
  Pick<Selection, 'llm'>;

// Ordered as they appear in get-started.mdx. Each id is one <GetStartedStep>.
export const stepIds = [
  'install-extension',
  'install-node',
  'connect-android',
  'connect-ios',
  'connect-harmonyos',
  'prepare-desktop',
  'model-api-key',
  'model-chatgpt-extension',
  'model-chatgpt-cli',
  'playground-web',
  'playground-device',
  'test-create',
  'test-configure',
  'test-run',
  'sdk-integrate',
  'next-steps',
] as const;

export type StepId = (typeof stepIds)[number];

const deviceSteps: Record<Exclude<Platform, 'web'>, StepId> = {
  android: 'connect-android',
  ios: 'connect-ios',
  harmonyos: 'connect-harmonyos',
  desktop: 'prepare-desktop',
};

export function isComplete(
  selection: Selection,
): selection is CompleteSelection {
  return Boolean(
    selection.scene &&
      selection.platform &&
      selection.model &&
      (selection.model !== 'api-key' || selection.llm),
  );
}

export function planSteps(selection: CompleteSelection): StepId[] {
  const { scene, platform, model } = selection;
  // The Chrome extension is the only path that needs neither Node.js nor a CLI login.
  const inExtension = scene === 'playground' && platform === 'web';
  const steps: StepId[] = [];
  if (inExtension) {
    steps.push('install-extension');
  } else if (scene !== 'playground') {
    // Device Playgrounds check Node.js in their own launch instructions.
    steps.push('install-node');
  }

  if (platform !== 'web') {
    steps.push(deviceSteps[platform]);
  }

  if (model === 'api-key') {
    steps.push('model-api-key');
  } else {
    // The CLI login needs Node.js, which device Playgrounds have not checked yet.
    steps.push(inExtension ? 'model-chatgpt-extension' : 'model-chatgpt-cli');
  }

  if (scene === 'playground') {
    steps.push(inExtension ? 'playground-web' : 'playground-device');
  } else if (scene === 'test') {
    steps.push('test-create', 'test-configure', 'test-run');
  } else {
    steps.push('sdk-integrate');
  }

  if (scene !== 'playground') {
    steps.push('next-steps');
  }
  return steps;
}

function pick<T extends string>(
  values: readonly T[],
  value: string | null,
): T | undefined {
  return values.find((candidate) => candidate === value);
}

export function parseSelection(search: string): Selection {
  const params = new URLSearchParams(search);
  return {
    scene: pick(scenes, params.get('scene')),
    platform: pick(platforms, params.get('platform')),
    model: pick(models, params.get('model')),
    llm: pick(llms, params.get('llm')),
  };
}

export function serializeSelection(search: string, selection: Selection) {
  const params = new URLSearchParams(search);
  for (const key of ['platform', 'scene', 'model', 'llm'] as const) {
    const value = selection[key];
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

type Condition<T> = T | readonly T[] | undefined;

function matchesValue<T>(condition: Condition<T>, value: T) {
  if (condition === undefined) return true;
  return Array.isArray(condition)
    ? condition.includes(value)
    : condition === value;
}

export interface SelectionCondition {
  scene?: Condition<Scene>;
  platform?: Condition<Platform>;
  model?: Condition<ModelAccess>;
  llm?: Condition<Llm>;
}

export function matchesSelection(
  condition: SelectionCondition,
  selection: CompleteSelection,
) {
  return (
    matchesValue(condition.scene, selection.scene) &&
    matchesValue(condition.platform, selection.platform) &&
    matchesValue(condition.model, selection.model) &&
    (condition.llm === undefined ||
      (selection.llm !== undefined &&
        matchesValue(condition.llm, selection.llm)))
  );
}
