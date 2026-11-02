import React, {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import {
  type CompleteSelection,
  type Llm,
  type ModelAccess,
  type Platform,
  type Scene,
  type Selection,
  type SelectionCondition,
  type StepId,
  isComplete,
  llms,
  matchesSelection,
  models,
  parseSelection,
  planSteps,
  platforms,
  scenes,
  serializeSelection,
} from './get-started-plan';
import './GetStarted.css';

type Lang = 'en' | 'zh';

interface Option {
  label: string;
  description?: string;
}

const copy = {
  en: {
    scene: 'What do you want to do first?',
    platform: 'Which platform do you want to automate?',
    model: 'How will you connect a model?',
    scenes: {
      playground: {
        label: 'Try it in Playground',
        description: 'No project needed. Run one action and one assertion.',
      },
      test: {
        label: 'Create a Midscene Test project',
        description: 'Write and run E2E cases in YAML.',
      },
      sdk: {
        label: 'Add to a JavaScript test project',
      },
    } satisfies Record<Scene, Option>,
    platforms: {
      web: { label: 'Web' },
      android: { label: 'Android' },
      ios: { label: 'iOS' },
      harmonyos: { label: 'HarmonyOS' },
      desktop: { label: 'Desktop' },
    } satisfies Record<Platform, Option>,
    models: {
      'api-key': {
        label: 'Model API Key',
        description: 'Use an API Key from a model provider.',
      },
      chatgpt: {
        label: 'ChatGPT subscription',
        description:
          'Sign in with ChatGPT and use the GPT models in your plan.',
      },
    } satisfies Record<ModelAccess, Option>,
    sdkWeb: 'Add visual actions and assertions to Playwright Test.',
    sdkDevice: 'Add visual actions and assertions to Vitest.',
    choose: 'Choose one',
    pending: 'Answer the questions above to see your setup steps.',
    // Announced to screen readers only; the steps themselves are the visible answer.
    ready: 'Your setup steps are shown below.',
    step: (index: number) => `Step ${index}`,
    llm: 'Which model do you want to use?',
    llms: {
      'doubao-seed-model': {
        label: 'Doubao-Seed-2.1 Turbo',
        description: 'ByteDance',
      },
      qwen: { label: 'Qwen3.7 Plus', description: 'Alibaba' },
      deepseek: { label: 'DeepSeek V4.1 Flash', description: 'DeepSeek' },
      gemini: { label: 'Gemini 3.5 Flash', description: 'Google' },
      gpt: { label: 'GPT-6 Sol', description: 'OpenAI' },
      kimi: { label: 'Kimi K3', description: 'Moonshot AI' },
      'xiaomi-mimo': { label: 'MiMo V2.6 Pro', description: 'Xiaomi' },
      'glm-v': { label: 'GLM-5V-Turbo', description: 'Zhipu AI' },
      'ant-ling': { label: 'Ling-3.0-flash-VL', description: 'Ant Group' },
    } satisfies Record<Llm, Option>,
  },
  zh: {
    scene: '你想先做什么？',
    platform: '要自动化哪个平台？',
    model: '如何接入模型？',
    scenes: {
      playground: {
        label: '在 Playground 中体验',
        description: '无需创建工程，执行一次操作和一次断言。',
      },
      test: {
        label: '创建 Midscene Test 项目',
        description: '用 YAML 编写并运行 E2E 用例。',
      },
      sdk: {
        label: '接入 JavaScript 测试工程',
      },
    } satisfies Record<Scene, Option>,
    platforms: {
      web: { label: 'Web' },
      android: { label: 'Android' },
      ios: { label: 'iOS' },
      harmonyos: { label: 'HarmonyOS' },
      desktop: { label: '桌面端' },
    } satisfies Record<Platform, Option>,
    models: {
      'api-key': {
        label: '模型 API Key',
        description: '使用模型服务商提供的 API Key。',
      },
      chatgpt: {
        label: 'ChatGPT 订阅',
        description: '登录 ChatGPT，使用订阅中的 GPT 模型。',
      },
    } satisfies Record<ModelAccess, Option>,
    sdkWeb: '在 Playwright Test 中加入视觉操作与断言。',
    sdkDevice: '在 Vitest 中加入视觉操作与断言。',
    choose: '请选择',
    pending: '回答上面的问题后，这里会列出你需要完成的步骤。',
    ready: '下方已列出你的配置步骤。',
    step: (index: number) => `第 ${index} 步`,
    llm: '使用哪个模型？',
    llms: {
      'doubao-seed-model': {
        label: 'Doubao-Seed-2.1 Turbo',
        description: '字节跳动',
      },
      qwen: { label: 'Qwen3.7 Plus', description: '阿里巴巴' },
      deepseek: { label: 'DeepSeek V4.1 Flash', description: '深度求索' },
      gemini: { label: 'Gemini 3.5 Flash', description: 'Google' },
      gpt: { label: 'GPT-6 Sol', description: 'OpenAI' },
      kimi: { label: 'Kimi K3', description: '月之暗面' },
      'xiaomi-mimo': { label: 'MiMo V2.6 Pro', description: '小米' },
      'glm-v': { label: 'GLM-5V-Turbo', description: '智谱' },
      'ant-ling': { label: 'Ling-3.0-flash-VL', description: '蚂蚁集团' },
    } satisfies Record<Llm, Option>,
  },
};

const GetStartedContext = createContext<{
  lang: Lang;
  selection: CompleteSelection;
  steps: StepId[];
} | null>(null);

function useGetStarted() {
  const context = useContext(GetStartedContext);
  if (!context) {
    throw new Error('Get started steps must be inside GetStarted');
  }
  return context;
}

function Question<T extends string>({
  legend,
  values,
  options,
  selected,
  onSelect,
  choose,
}: {
  legend: string;
  values: readonly T[];
  options: Record<T, Option>;
  selected?: T;
  onSelect: (value: T) => void;
  choose: string;
}) {
  const name = useId();
  // Questions appear one at a time, so the unanswered one is the next to answer.
  const pending = selected === undefined;
  return (
    <fieldset
      className={`get-started-question${pending ? ' get-started-question-pending' : ''}`}
    >
      <legend>
        {legend}
        {pending ? <span className="get-started-choose">{choose}</span> : null}
      </legend>
      <div className="get-started-options">
        {values.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={selected === value}
              onChange={() => onSelect(value)}
            />
            <span>
              <strong>{options[value].label}</strong>
              {options[value].description ? (
                <small>{options[value].description}</small>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function GetStarted({
  lang,
  initialSelection,
  children,
}: {
  lang: Lang;
  // Used by tests; in the browser the selection comes from the URL query.
  initialSelection?: Selection;
  children?: ReactNode;
}) {
  const text = copy[lang];
  const [selection, setSelection] = useState<Selection>(initialSelection ?? {});

  useEffect(() => {
    if (!initialSelection) {
      setSelection(parseSelection(window.location.search));
    }
  }, [initialSelection]);

  const update = (next: Selection) => {
    setSelection(next);
    const { pathname, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${serializeSelection(search, next)}${hash}`,
    );
  };

  const complete = isComplete(selection);
  const steps = complete ? planSteps(selection) : [];

  return (
    <div className="get-started">
      <Question
        legend={text.platform}
        values={platforms}
        options={text.platforms}
        selected={selection.platform}
        onSelect={(platform) => update({ ...selection, platform })}
        choose={text.choose}
      />
      {selection.platform ? (
        <Question
          legend={text.scene}
          values={scenes}
          options={{
            ...text.scenes,
            // Name the runner that the chosen platform uses.
            sdk: {
              ...text.scenes.sdk,
              description:
                selection.platform === 'web' ? text.sdkWeb : text.sdkDevice,
            },
          }}
          selected={selection.scene}
          onSelect={(scene) => update({ ...selection, scene })}
          choose={text.choose}
        />
      ) : null}
      {selection.scene && selection.platform ? (
        <Question
          legend={text.model}
          values={models}
          options={text.models}
          selected={selection.model}
          onSelect={(model) => update({ ...selection, model })}
          choose={text.choose}
        />
      ) : null}
      {selection.scene &&
      selection.platform &&
      selection.model === 'api-key' ? (
        <Question
          legend={text.llm}
          values={llms}
          options={text.llms}
          selected={selection.llm}
          onSelect={(llm) => update({ ...selection, llm })}
          choose={text.choose}
        />
      ) : null}
      <p
        className={
          complete ? 'get-started-visually-hidden' : 'get-started-status'
        }
        aria-live="polite"
      >
        {complete ? text.ready : text.pending}
      </p>
      {/* Keep this container mounted: the Rspress outline only rescans when an
          inserted node is a heading or its direct parent, so each step section
          must be inserted on its own. */}
      <div className="get-started-steps">
        {complete ? (
          <GetStartedContext.Provider value={{ lang, selection, steps }}>
            {children}
          </GetStartedContext.Provider>
        ) : null}
      </div>
    </div>
  );
}

export function GetStartedStep({
  id,
  children,
}: {
  id: StepId;
  children?: ReactNode;
}) {
  const { lang, steps } = useGetStarted();
  const index = steps.indexOf(id);
  if (index < 0) return null;
  // The step number sits above the heading so it does not read like the
  // ordered lists inside the step.
  return (
    <section className="get-started-step" data-step={id}>
      <p className="get-started-step-label">{copy[lang].step(index + 1)}</p>
      {children}
    </section>
  );
}

export function GetStartedWhen({
  children,
  ...condition
}: SelectionCondition & { children?: ReactNode }) {
  const { selection } = useGetStarted();
  return matchesSelection(condition, selection) ? <>{children}</> : null;
}
