import React, {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import { SdkPlatformProvider } from './SdkPlatform';
import {
  type CompleteSelection,
  type Lang,
  type Llm,
  type ModelAccess,
  type Platform,
  type Scene,
  type Selection,
  type SelectionCondition,
  type StepId,
  defaultLlm,
  getStartedRoute,
  isComplete,
  llmLabels,
  llms,
  matchesSelection,
  models,
  parseSelection,
  pathLabels,
  pathSlug,
  planSteps,
  platforms,
  resolveSelection,
  sceneLabel,
  scenes,
  serializeSelection,
} from './get-started-plan';
import './GetStarted.css';

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
    sdkDevice: 'Add visual actions and assertions with Rstest or Vitest.',
    choose: 'Choose one',
    pending: 'Choose an option above to see your setup steps',
    pendingLeft: (left: number) =>
      `${left} ${left === 1 ? 'question' : 'questions'} left · or pick a path from the list below.`,
    step: (index: number) => `Step ${index}`,
    llm: 'Which model do you want to use?',
    otherModels: (current: string) =>
      `The configuration below is for ${current}. Other recommended models:`,
    vendors: {
      'doubao-seed-model': 'ByteDance',
      qwen: 'Alibaba',
      deepseek: 'DeepSeek',
      gemini: 'Google',
      gpt: 'OpenAI',
      kimi: 'Moonshot AI',
      'xiaomi-mimo': 'Xiaomi',
      'glm-v': 'Zhipu AI',
      'ant-ling': 'Ant Group',
    } satisfies Record<Llm, string>,
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
    sdkDevice: '通过 Rstest 或 Vitest 加入视觉操作与断言。',
    choose: '请选择',
    pending: '请先完成上方的选择，即可查看配置步骤',
    pendingLeft: (left: number) =>
      `还剩 ${left} 个问题 · 也可以直接从下方列表中选择。`,
    step: (index: number) => `第 ${index} 步`,
    llm: '使用哪个模型？',
    otherModels: (current: string) =>
      `下方是 ${current} 的配置。其他推荐模型：`,
    vendors: {
      'doubao-seed-model': '字节跳动',
      qwen: '阿里巴巴',
      deepseek: '深度求索',
      gemini: 'Google',
      gpt: 'OpenAI',
      kimi: '月之暗面',
      'xiaomi-mimo': '小米',
      'glm-v': '智谱',
      'ant-ling': '蚂蚁集团',
    } satisfies Record<Llm, string>,
  },
};

const GetStartedContext = createContext<{
  lang: Lang;
  selection: CompleteSelection;
  steps: StepId[];
  selectLlm: (llm: Llm) => void;
  routeOf: (selection: CompleteSelection) => string;
  navigate: Navigate;
} | null>(null);

export function useGetStarted() {
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
  className,
}: {
  legend: string;
  values: readonly T[];
  options: Record<T, Option>;
  selected?: T;
  onSelect: (value: T) => void;
  choose: string;
  className?: string;
}) {
  const name = useId();
  // Questions appear one at a time, so the unanswered one is the next to answer.
  const pending = selected === undefined;
  return (
    <fieldset
      className={`get-started-question${pending ? ' get-started-question-pending' : ''}${className ? ` ${className}` : ''}`}
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

type Navigate = (to: string, options?: { replace?: boolean }) => void;

const defaultNavigate: Navigate = (to, options) => {
  if (options?.replace) window.location.replace(to);
  else window.location.assign(to);
};

// SSG-MD renders pages to Markdown for llms.txt and the .md files. The
// questions are interactive only, so they are left out of that output.
function isSsgMd() {
  return Boolean(import.meta.env.SSG_MD);
}

// In the Markdown output, link to the Markdown version of other pages, the
// same way Rspress rewrites links written in MDX.
function docHref(route: string, hash?: string) {
  const target = isSsgMd() ? `${route}.md` : route;
  return hash ? `${target}#${hash}` : target;
}

export function GetStarted({
  lang,
  path,
  initialSelection,
  navigate = defaultNavigate,
  children,
}: {
  lang: Lang;
  // Set on a path page. Its steps are rendered into the static HTML.
  path?: CompleteSelection;
  // Used by tests of the entry page; in the browser it comes from the URL query.
  initialSelection?: Selection;
  navigate?: Navigate;
  children?: ReactNode;
}) {
  const text = copy[lang];
  const [selection, setSelection] = useState<Selection>(
    path ?? initialSelection ?? {},
  );
  const slug = path ? pathSlug(path) : undefined;

  const routeOf = (next: CompleteSelection) => {
    const route = getStartedRoute(lang, next);
    return next.model === 'api-key' && next.llm
      ? `${route}?llm=${next.llm}`
      : route;
  };

  // Depend on the slug, not the `path` object, which MDX recreates on render.
  useEffect(() => {
    const fromUrl = parseSelection(window.location.search);
    if (path) {
      // A path page only keeps the model choice in its query.
      if (fromUrl.llm) setSelection({ ...path, llm: fromUrl.llm });
      return;
    }
    if (initialSelection) return;
    // Older links put the whole selection in the query of the entry page.
    if (isComplete(fromUrl)) {
      navigate(routeOf(fromUrl), { replace: true });
      return;
    }
    setSelection(fromUrl);
  }, [slug]);

  const update = (next: Selection) => {
    if (isComplete(next)) {
      navigate(routeOf(next));
      return;
    }
    setSelection(next);
    const { pathname, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${serializeSelection(search, next)}${hash}`,
    );
  };

  const selectLlm = (llm: Llm) => {
    setSelection({ ...selection, llm });
    const { pathname, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${serializeSelection(search, { llm })}${hash}`,
    );
  };

  const active =
    path && isComplete(selection) ? resolveSelection(selection) : undefined;
  const steps = active ? planSteps(active) : [];
  const ssgMd = isSsgMd();

  return (
    <>
      {/* Path pages open with their answers set, so only the entry page
          animates questions in as they are answered. */}
      <div className={`get-started${path ? ' get-started-path' : ''}`}>
        {ssgMd ? null : (
          <>
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
                      selection.platform === 'web'
                        ? text.sdkWeb
                        : text.sdkDevice,
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
            {active ? null : (
              // Points back up at the unanswered question until all are set.
              <output className="get-started-status">
                <svg
                  className="get-started-status-arrow"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path
                    d="M12 19V5M5 12l7-7 7 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="get-started-status-text">
                  <strong>{text.pending}</strong>
                  <span>
                    {text.pendingLeft(
                      [
                        selection.platform,
                        selection.scene,
                        selection.model,
                      ].filter((answer) => answer === undefined).length,
                    )}
                  </span>
                </span>
              </output>
            )}
          </>
        )}
      </div>
      {/* Steps render without a wrapper element, so their headings are direct
          children of the doc content like any other page. The Rspress outline
          only rescans after client navigation when an inserted node is a
          heading or contains one as a direct child. */}
      {active ? (
        <GetStartedContext.Provider
          value={{
            lang,
            selection: active,
            steps,
            selectLlm,
            routeOf,
            navigate,
          }}
        >
          {children}
        </GetStartedContext.Provider>
      ) : null}
    </>
  );
}

export function GetStartedStep({
  id,
  children,
}: {
  id: StepId;
  children?: ReactNode;
}) {
  const context = useGetStarted();
  const { lang, steps } = context;
  const index = steps.indexOf(id);
  if (index < 0) return null;
  // In Markdown the step headings already give the order, and a bare
  // "Step 1" line would sit apart from its heading.
  if (isSsgMd()) return <>{markdownSwitchLinks(children, context)}</>;
  // The step number sits above the heading so it does not read like the
  // ordered lists inside the step. No wrapper element: see GetStarted.
  return (
    <>
      <p className="get-started-step-label" data-step={id}>
        {copy[lang].step(index + 1)}
      </p>
      {children}
    </>
  );
}

export function GetStartedWhen({
  children,
  ...condition
}: SelectionCondition & { children?: ReactNode }) {
  const context = useGetStarted();
  if (!matchesSelection(condition, context.selection)) return null;
  // A block keeps the Markdown output from joining paragraphs of adjacent
  // variations.
  return isSsgMd() ? (
    <div>{markdownSwitchLinks(children, context)}</div>
  ) : (
    <>{children}</>
  );
}

// Content for the interactive page only, such as text that points to the
// questions. The Markdown output has no questions.
export function GetStartedHtmlOnly({ children }: { children?: ReactNode }) {
  return isSsgMd() ? null : <>{children}</>;
}

// The Markdown counterpart of GetStartedHtmlOnly. Put whole blocks in both:
// SSG-MD splits a paragraph that contains JSX into separate lines.
export function GetStartedMarkdownOnly({
  children,
}: {
  children?: ReactNode;
}) {
  return isSsgMd() ? <>{children}</> : null;
}

const switchTag =
  /<GetStartedSwitch scene="([^"]*)">([\s\S]*?)<\/GetStartedSwitch>/g;

// SSG-MD writes a Markdown block that contains JSX (such as a list item with
// a GetStartedSwitch) as source text, so the steps receive the tag as a
// string. Turn it into a link to the Markdown page of the other usage.
function markdownSwitchLinks(
  children: ReactNode,
  { lang, selection }: { lang: Lang; selection: CompleteSelection },
) {
  return React.Children.map(children, (child) => {
    if (typeof child !== 'string') return child;
    return child.replace(switchTag, (_, scene: string, label: string) => {
      if (!(scenes as readonly string[]).includes(scene)) {
        throw new Error(`Unknown GetStartedSwitch scene: ${scene}`);
      }
      const href = docHref(
        getStartedRoute(lang, { ...selection, scene: scene as Scene }),
      );
      return `[${label}](${href})`;
    });
  });
}

// The model picker inside the API Key step. Changing it only swaps the model
// card below, so the step list stays where it is.
export function GetStartedLlmPicker() {
  const { lang, selection, selectLlm } = useGetStarted();
  const text = copy[lang];
  const current = selection.llm ?? defaultLlm;
  if (isSsgMd()) {
    // Markdown readers cannot switch the card, so link to the other models.
    const prefix = lang === 'zh' ? '/zh' : '';
    return (
      <>
        <p>{text.otherModels(llmLabels[current])}</p>
        <ul>
          {llms
            .filter((llm) => llm !== current)
            .map((llm) => (
              <li key={llm}>
                <a href={docHref(`${prefix}/model-api-setup`, llm)}>
                  {llmLabels[llm]}
                </a>
                {` (${text.vendors[llm]})`}
              </li>
            ))}
        </ul>
      </>
    );
  }
  const options = Object.fromEntries(
    llms.map((llm) => [
      llm,
      { label: llmLabels[llm], description: text.vendors[llm] },
    ]),
  ) as Record<Llm, Option>;
  return (
    <Question
      legend={text.llm}
      values={llms}
      options={options}
      selected={current}
      onSelect={selectLlm}
      choose={text.choose}
      className="get-started-llm-picker"
    />
  );
}

// Links to every setup path, grouped by platform. It is the static index of the
// entry page for search engines and LLMs.
export function GetStartedPathIndex({ lang }: { lang: Lang }) {
  const labels = pathLabels[lang];
  // One list per platform: nested lists do not survive the Markdown output.
  return (
    <div className="get-started-path-index">
      {platforms.map((platform) => (
        <React.Fragment key={platform}>
          <p>
            <strong>{labels.platforms[platform]}</strong>
          </p>
          <ul>
            {scenes.map((scene) => (
              <li key={scene}>
                {`${sceneLabel(lang, { platform, scene })}: `}
                {models.map((model, index) => (
                  <React.Fragment key={model}>
                    {index > 0 ? ' · ' : null}
                    <a
                      className="rp-link"
                      href={docHref(
                        getStartedRoute(lang, { platform, scene, model }),
                      )}
                    >
                      {labels.models[model]}
                    </a>
                  </React.Fragment>
                ))}
              </li>
            ))}
          </ul>
        </React.Fragment>
      ))}
    </div>
  );
}

// A link to the page with the same platform and model and another usage.
export function GetStartedSwitch({
  scene,
  children,
}: {
  scene: Scene;
  children?: ReactNode;
}) {
  const { selection, routeOf, navigate } = useGetStarted();
  const href = routeOf({ ...selection, scene });
  return (
    <a
      className="rp-link"
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

// Shows the Vitest guide fragments for the platform of this path only.
export function GetStartedSdkPlatform({ children }: { children?: ReactNode }) {
  const { lang, selection } = useGetStarted();
  if (selection.platform === 'web') {
    throw new Error('GetStartedSdkPlatform is only for device platforms');
  }
  return (
    <SdkPlatformProvider lang={lang} platform={selection.platform}>
      {children}
    </SdkPlatformProvider>
  );
}
