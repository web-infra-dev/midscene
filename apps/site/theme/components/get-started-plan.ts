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

// Display names for the model picker. They are the same in every language.
// Keep them in sync with the recommended models in model-api-setup.mdx.
export const llmLabels: Record<(typeof llms)[number], string> = {
  'doubao-seed-model': 'Doubao-Seed-2.1 Turbo',
  qwen: 'Qwen3.7 Plus',
  deepseek: 'DeepSeek V4.1 Flash',
  gemini: 'Gemini 3.5 Flash',
  gpt: 'GPT-6 Sol',
  kimi: 'Kimi K3',
  'xiaomi-mimo': 'MiMo V2.6 Pro',
  'glm-v': 'GLM-5V-Turbo',
  'ant-ling': 'Ling-3.0-flash-VL',
};

// Shown until the reader picks another model in the model step.
export const defaultLlm = llms[0];

export type Scene = (typeof scenes)[number];
export type Platform = (typeof platforms)[number];
export type ModelAccess = (typeof models)[number];
export type Llm = (typeof llms)[number];

export interface Selection {
  scene?: Scene;
  platform?: Platform;
  model?: ModelAccess;
  // Picked inside the API Key model step. It only changes which model card is
  // shown, so it is not one of the questions that gate the steps.
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
  // Created before the model step so the model values go straight into the
  // project's .env file.
  'test-create',
  'model-api-key',
  'model-chatgpt-extension',
  'model-chatgpt-cli',
  'playground-web',
  'playground-device-launch',
  'playground-device-run',
  'test-configure',
  'test-run',
  'sdk-setup',
  'sdk-write',
  'sdk-run',
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
  return Boolean(selection.scene && selection.platform && selection.model);
}

// Fills in the model that the API Key step shows before the reader picks one.
export function resolveSelection(
  selection: CompleteSelection,
): CompleteSelection {
  return selection.model === 'api-key' && !selection.llm
    ? { ...selection, llm: defaultLlm }
    : selection;
}

// `@midscene/test create --platform` values.
const testPlatforms: Record<Platform, string> = {
  web: 'web',
  android: 'android',
  ios: 'ios',
  harmonyos: 'harmony',
  desktop: 'computer',
};

export function testCreateCommand(platform: Platform) {
  return [
    'pnpm dlx @midscene/test create my-tests \\',
    `  --platform ${testPlatforms[platform]} \\`,
    '  --package-manager pnpm',
    'cd my-tests',
  ].join('\n');
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

  if (scene === 'test') {
    steps.push('test-create');
  }

  if (model === 'api-key') {
    steps.push('model-api-key');
  } else {
    // The CLI login needs Node.js, which device Playgrounds have not checked yet.
    steps.push(inExtension ? 'model-chatgpt-extension' : 'model-chatgpt-cli');
  }

  if (scene === 'playground') {
    // The extension is already open; a device Playground is launched first.
    if (inExtension) steps.push('playground-web');
    else steps.push('playground-device-launch', 'playground-device-run');
  } else if (scene === 'test') {
    steps.push('test-configure', 'test-run');
  } else {
    steps.push('sdk-setup', 'sdk-write', 'sdk-run');
  }

  steps.push('next-steps');
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

export type Lang = 'en' | 'zh';

// Every complete selection has its own page, so the static HTML and Markdown
// of a page contain exactly one setup path.
export const allPaths: CompleteSelection[] = platforms.flatMap((platform) =>
  scenes.flatMap((scene) =>
    models.map((model) => ({ platform, scene, model })),
  ),
);

export function pathSlug({ platform, scene, model }: CompleteSelection) {
  return `${platform}-${scene}-${model}`;
}

export function parsePathSlug(slug: string): CompleteSelection | undefined {
  return allPaths.find((path) => pathSlug(path) === slug);
}

export function getStartedRoute(lang: Lang, path?: CompleteSelection) {
  const base = `${lang === 'zh' ? '/zh' : ''}/get-started`;
  return path ? `${base}/${pathSlug(path)}` : base;
}

// Whether a pathname is one of the generated path pages, such as
// `/get-started/web-playground-api-key` or its `/zh` and `.html` forms.
export function isGetStartedPathPage(pathname: string) {
  const match = pathname.match(
    /^(?:\/zh)?\/get-started\/([^/]+?)(?:\.html)?\/?$/,
  );
  return Boolean(match && parsePathSlug(match[1]));
}

// Labels for page titles, descriptions, and the path index. The questions use
// longer option labels in GetStarted.tsx.
export const pathLabels = {
  en: {
    platforms: {
      web: 'Web',
      android: 'Android',
      ios: 'iOS',
      harmonyos: 'HarmonyOS',
      desktop: 'Desktop',
    } satisfies Record<Platform, string>,
    scenes: {
      playground: 'Playground',
      test: 'Midscene Test',
      sdk: 'JavaScript SDK',
    } satisfies Record<Scene, string>,
    models: {
      chatgpt: 'ChatGPT subscription',
      'api-key': 'Model API Key',
    } satisfies Record<ModelAccess, string>,
  },
  zh: {
    platforms: {
      web: 'Web',
      android: 'Android',
      ios: 'iOS',
      harmonyos: 'HarmonyOS',
      desktop: '桌面端',
    } satisfies Record<Platform, string>,
    scenes: {
      playground: 'Playground',
      test: 'Midscene Test',
      sdk: 'JavaScript SDK',
    } satisfies Record<Scene, string>,
    models: {
      chatgpt: 'ChatGPT 订阅',
      'api-key': '模型 API Key',
    } satisfies Record<ModelAccess, string>,
  },
};

// The SDK path uses Playwright Test on Web and Vitest on devices.
export function sceneLabel(
  lang: Lang,
  { platform, scene }: Pick<CompleteSelection, 'platform' | 'scene'>,
) {
  if (scene !== 'sdk') return pathLabels[lang].scenes[scene];
  return platform === 'web' ? 'Playwright Test' : 'Rstest / Vitest';
}

export function pathTitle(lang: Lang, path: CompleteSelection) {
  const labels = pathLabels[lang];
  const parts = [
    labels.platforms[path.platform],
    sceneLabel(lang, path),
    labels.models[path.model],
  ].join(' · ');
  return lang === 'zh' ? `开始使用：${parts}` : `Get started: ${parts}`;
}

const han = /[\u4e00-\u9fff]/;
const latin = /[A-Za-z0-9`]/;

// Joins Chinese copy with a space only between Chinese characters and Latin
// text, ignoring Markdown emphasis markers at the boundary.
export function zhJoin(...parts: string[]) {
  return parts.reduce((text, part) => {
    const end = text.replace(/\*+$/, '').slice(-1);
    const start = part.replace(/^\*+/, '').charAt(0);
    const space =
      (han.test(end) && latin.test(start)) ||
      (latin.test(end) && han.test(start))
        ? ' '
        : '';
    return `${text}${space}${part}`;
  }, '');
}

export function pathDescription(lang: Lang, path: CompleteSelection) {
  const labels = pathLabels[lang];
  const platform = labels.platforms[path.platform];
  const scene = sceneLabel(lang, path);
  const model = labels.models[path.model];
  return lang === 'zh'
    ? zhJoin(
        '在',
        platform,
        '上通过',
        scene,
        '和',
        model,
        '配置',
        'Midscene',
        '的完整步骤，最后完成一次可查看结果的运行。',
      )
    : `Step-by-step setup for Midscene on ${platform} with ${scene} and a ${model}, ending with a first run whose result you can inspect.`;
}
