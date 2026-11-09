import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, rstest } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getStartedPageContent,
  getStartedPages,
} from '../plugins/get-started-pages';
import {
  GetStarted,
  GetStartedHtmlOnly,
  GetStartedLlmPicker,
  GetStartedMarkdownOnly,
  GetStartedPathIndex,
  GetStartedSdkPlatform,
  GetStartedStep,
  GetStartedSwitch,
  GetStartedWhen,
} from '../theme/components/GetStarted';
import { SdkPlatformContent } from '../theme/components/SdkPlatform';
import {
  type CompleteSelection,
  type Selection,
  allPaths,
  defaultLlm,
  getStartedRoute,
  isComplete,
  isGetStartedPathPage,
  llmLabels,
  llms,
  models,
  parsePathSlug,
  parseSelection,
  pathDescription,
  pathSlug,
  pathTitle,
  planSteps,
  platforms,
  scenes,
  serializeSelection,
  stepIds,
  testCreateCommand,
  zhJoin,
} from '../theme/components/get-started-plan';

const combinations: CompleteSelection[] = scenes.flatMap((scene) =>
  platforms.flatMap((platform) =>
    models.map((model) =>
      model === 'api-key'
        ? { scene, platform, model, llm: 'qwen' as const }
        : { scene, platform, model },
    ),
  ),
);

const modelSteps = [
  'model-api-key',
  'model-chatgpt-extension',
  'model-chatgpt-cli',
] as const;
const deviceSteps = [
  'connect-android',
  'connect-ios',
  'connect-harmonyos',
  'prepare-desktop',
] as const;
const finalSteps = {
  playground: ['playground-web', 'playground-device-run'],
  test: ['test-run'],
  sdk: ['sdk-run'],
} as const;

describe('get started plan', () => {
  for (const selection of combinations) {
    const label = `${selection.scene}/${selection.platform}/${selection.model}`;
    it(`plans a complete first run for ${label}`, () => {
      const steps = planSteps(selection);
      expect(new Set(steps).size).toBe(steps.length);
      // Steps follow the page order so the rendered numbering matches the plan.
      expect(steps).toEqual(stepIds.filter((id) => steps.includes(id)));
      // Device Playgrounds check Node.js in their own launch step.
      const devicePlayground =
        selection.scene === 'playground' && selection.platform !== 'web';
      expect(steps.includes('install-node')).toBe(
        selection.scene !== 'playground',
      );
      if (!devicePlayground) {
        expect(['install-extension', 'install-node']).toContain(steps[0]);
      }
      expect(steps.at(-1)).toBe('next-steps');
      expect(
        steps.filter((id) => modelSteps.includes(id as never)),
      ).toHaveLength(1);
      expect(
        steps.filter((id) => deviceSteps.includes(id as never)),
      ).toHaveLength(selection.platform === 'web' ? 0 : 1);
      expect(finalSteps[selection.scene]).toContain(steps.at(-2));
      // Device Playgrounds launch in their own step, like the Web path runs
      // in its own step.
      if (devicePlayground) {
        expect(steps.slice(-3, -1)).toEqual([
          'playground-device-launch',
          'playground-device-run',
        ]);
      } else {
        expect(steps).not.toContain('playground-device-launch');
      }
      // A Test project exists before the model step, so the model values go
      // straight into its .env file.
      if (selection.scene === 'test') {
        const modelIndex = steps.findIndex((id) =>
          modelSteps.includes(id as never),
        );
        expect(steps.indexOf('test-create')).toBe(modelIndex - 1);
      }
    });
  }

  it('only uses the extension for the web Playground', () => {
    for (const selection of combinations) {
      const steps = planSteps(selection);
      const inExtension =
        selection.scene === 'playground' && selection.platform === 'web';
      expect(steps.includes('install-extension')).toBe(inExtension);
      if (selection.model === 'chatgpt') {
        expect(steps).toContain(
          inExtension ? 'model-chatgpt-extension' : 'model-chatgpt-cli',
        );
      }
    }
  });

  it('does not wait for a model choice before planning steps', () => {
    const base = { scene: 'test', platform: 'android' } as const;
    expect(isComplete({ ...base, model: 'chatgpt' })).toBe(true);
    expect(isComplete({ ...base, model: 'api-key' })).toBe(true);
    expect(isComplete({ scene: 'test', platform: 'android' })).toBe(false);
  });

  it('builds the create command for each platform', () => {
    expect(testCreateCommand('harmonyos')).toContain('--platform harmony \\');
    expect(testCreateCommand('desktop')).toContain('--platform computer \\');
    for (const platform of platforms) {
      expect(testCreateCommand(platform)).toMatch(
        /^pnpm dlx @midscene\/test create my-tests \\\n.*\n {2}--package-manager pnpm\ncd my-tests$/,
      );
    }
  });

  it('gives every setup path its own route', () => {
    expect(allPaths).toHaveLength(
      platforms.length * scenes.length * models.length,
    );
    const slugs = allPaths.map(pathSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const path of allPaths) {
      expect(parsePathSlug(pathSlug(path))).toEqual(path);
    }
    expect(parsePathSlug('web-unknown-chatgpt')).toBeUndefined();
    const path = {
      platform: 'harmonyos',
      scene: 'sdk',
      model: 'api-key',
    } as const;
    expect(getStartedRoute('en', path)).toBe(
      '/get-started/harmonyos-sdk-api-key',
    );
    expect(getStartedRoute('zh', path)).toBe(
      '/zh/get-started/harmonyos-sdk-api-key',
    );
    expect(getStartedRoute('zh')).toBe('/zh/get-started');
  });

  it('titles each path with the runner it uses', () => {
    expect(
      pathTitle('en', { platform: 'web', scene: 'sdk', model: 'chatgpt' }),
    ).toBe('Get started: Web · Playwright Test · ChatGPT subscription');
    expect(
      pathTitle('zh', { platform: 'desktop', scene: 'sdk', model: 'api-key' }),
    ).toBe('开始使用：桌面端 · Rstest / Vitest · 模型 API Key');
    expect(
      pathDescription('zh', {
        platform: 'desktop',
        scene: 'sdk',
        model: 'api-key',
      }),
    ).toBe(
      '在桌面端上通过 Rstest / Vitest 和模型 API Key 配置 Midscene 的完整步骤，最后完成一次可查看结果的运行。',
    );
  });

  it('spaces Chinese and Latin text but not Chinese punctuation', () => {
    expect(zhJoin('在', 'Android', '上使用', '**Vitest**', '、通过')).toBe(
      '在 Android 上使用 **Vitest**、通过',
    );
    expect(zhJoin('在', '**桌面端**', '上')).toBe('在**桌面端**上');
  });

  it('reads and writes the selection in the URL query', () => {
    expect(
      parseSelection('?scene=test&platform=android&model=chatgpt'),
    ).toEqual({ scene: 'test', platform: 'android', model: 'chatgpt' });
    expect(parseSelection('?scene=unknown&platform=web')).toEqual({
      scene: undefined,
      platform: 'web',
      model: undefined,
      llm: undefined,
    });
    expect(parseSelection('?model=api-key&llm=qwen').llm).toBe('qwen');
    expect(parseSelection('?model=api-key&llm=unknown').llm).toBeUndefined();
    expect(
      serializeSelection('?ref=home&model=api-key', {
        scene: 'playground',
        platform: 'ios',
      }),
    ).toBe('?ref=home&platform=ios&scene=playground');
    expect(serializeSelection('', {})).toBe('');
    expect(serializeSelection('?llm=gpt', { scene: 'test', llm: 'qwen' })).toBe(
      '?llm=qwen&scene=test',
    );
  });

  it('recognizes path page routes', () => {
    for (const pathname of [
      '/get-started/web-playground-api-key',
      '/zh/get-started/ios-sdk-chatgpt',
      '/get-started/android-test-api-key.html',
      '/get-started/desktop-playground-chatgpt/',
    ]) {
      expect(isGetStartedPathPage(pathname)).toBe(true);
    }
    for (const pathname of [
      '/get-started',
      '/zh/get-started/',
      '/get-started/unknown-path',
      '/platforms/web',
    ]) {
      expect(isGetStartedPathPage(pathname)).toBe(false);
    }
  });
});

describe('get started pages', () => {
  for (const lang of ['en', 'zh'] as const) {
    it(`defines every planned step in the ${lang} page order`, () => {
      const page = readFileSync(
        new URL(
          `../docs/${lang}/common/get-started-steps.mdx`,
          import.meta.url,
        ),
        'utf8',
      );
      const ids = Array.from(
        page.matchAll(/<GetStartedStep id="([^"]+)">/g),
        (match) => match[1],
      );
      expect(ids).toEqual([...stepIds]);

      // The model picker lives in the API Key step.
      const apiKeyStep = page.slice(
        page.indexOf('<GetStartedStep id="model-api-key">'),
        page.indexOf('<GetStartedStep id="model-chatgpt-extension">'),
      );
      expect(apiKeyStep).toContain('<GetStartedLlmPicker />');

      // The JavaScript path reuses the integration guides' sections.
      for (const fragment of [
        'sdk-playwright-setup',
        'sdk-playwright-fixture',
        'sdk-playwright-write',
        'sdk-playwright-run',
        'sdk-vitest-install',
        'sdk-vitest-config',
        'sdk-vitest-write',
        'sdk-vitest-run',
      ]) {
        expect(page).toContain(`'./${fragment}.mdx'`);
      }
      // Playground readers can move on to the other usages.
      expect(page).toContain('<GetStartedSwitch scene="test">');
      expect(page).toContain('<GetStartedSwitch scene="sdk">');

      // Every model choice links to its section and reuses the shared card.
      const setup = readFileSync(
        new URL(`../docs/${lang}/model-api-setup.mdx`, import.meta.url),
        'utf8',
      );
      const choices = Array.from(
        page.matchAll(/<GetStartedWhen llm="([^"]+)">/g),
        (match) => match[1],
      );
      expect(choices).toEqual([...llms]);
      for (const id of choices) {
        expect(setup).toContain(`{#${id}}`);
        expect(setup).toContain(`./common/model-cards/${id}.mdx`);
        expect(page).toContain(`./model-cards/${id}.mdx`);
      }
      for (const [, fragment] of page.matchAll(/from '\.\/([^']+\.mdx)'/g)) {
        expect(() =>
          readFileSync(
            new URL(`../docs/${lang}/common/${fragment}`, import.meta.url),
          ),
        ).not.toThrow();
      }
      // Links in the fragment are relative to common/.
      expect(page).not.toMatch(/\]\(\.\/(?!#)/);
    });
  }
});

describe('get started component', () => {
  const steps = stepIds.map((id) =>
    createElement(GetStartedStep, { key: id, id }, `step:${id};`),
  );

  it('asks one question at a time before showing steps', () => {
    const html = renderToStaticMarkup(
      createElement(GetStarted, { lang: 'en', initialSelection: {} }, steps),
    );
    expect(html.match(/<fieldset/g)).toHaveLength(1);
    expect(html).toContain('Which platform do you want to automate?');
    expect(html).not.toContain('What do you want to do first?');
    // Only the unanswered question is highlighted.
    expect(html.match(/get-started-question-pending/g)).toHaveLength(1);
    expect(html).toContain('Choose one');
    expect(html).not.toContain('step:');

    const partial = renderToStaticMarkup(
      createElement(
        GetStarted,
        {
          lang: 'en',
          initialSelection: { scene: 'test', platform: 'android' },
        },
        steps,
      ),
    );
    expect(partial.match(/<fieldset/g)).toHaveLength(3);
    // Platform and scene are answered; the model question is next.
    expect(partial.match(/get-started-question-pending/g)).toHaveLength(1);
    expect(partial).not.toContain('step:');
  });

  it('renders only the planned steps and matching variations', () => {
    const selection: CompleteSelection = {
      scene: 'test',
      platform: 'android',
      model: 'chatgpt',
    };
    const html = renderToStaticMarkup(
      createElement(GetStarted, { lang: 'zh', path: selection }, [
        ...steps,
        createElement(
          GetStartedWhen,
          { key: 'android', platform: ['android', 'ios'], model: 'chatgpt' },
          'when:android',
        ),
        createElement(
          GetStartedWhen,
          { key: 'web', platform: 'web' },
          'when:web',
        ),
      ]),
    );
    const planned = planSteps(selection);
    for (const id of stepIds) {
      expect(html.includes(`step:${id};`)).toBe(planned.includes(id));
    }
    // Steps have no wrapper element, so the Rspress outline sees their
    // headings after client-side navigation.
    expect(html).not.toContain('<section');
    expect(html).not.toContain('get-started-steps');
    expect(html).toContain('when:android');
    expect(html).not.toContain('when:web');
    // A path page shows its steps, not the prompt to answer the questions.
    expect(html).not.toContain('get-started-status');
    expect(html).toContain('第 1 步</p>step:install-node;');
    expect(html).toContain(`第 ${planned.length} 步</p>step:next-steps;`);
    expect(html).toContain('桌面端');
    expect(html.match(/checked=""/g)).toHaveLength(3);
  });

  it('links to another usage with the same platform and model', () => {
    const html = renderToStaticMarkup(
      createElement(
        GetStarted,
        {
          lang: 'en',
          path: { scene: 'playground', platform: 'ios', model: 'api-key' },
        },
        createElement(
          GetStartedStep,
          { id: 'next-steps' },
          createElement(GetStartedSwitch, { scene: 'test' }, 'to-test'),
        ),
      ),
    );
    // The model shown on this page carries over to the next page.
    expect(html).toContain(
      `href="/get-started/ios-test-api-key?llm=${defaultLlm}">to-test</a>`,
    );
  });

  it('shows no steps on the entry page', () => {
    const html = renderToStaticMarkup(
      createElement(
        GetStarted,
        {
          lang: 'en',
          initialSelection: {
            scene: 'test',
            platform: 'web',
            model: 'chatgpt',
          },
        },
        steps,
      ),
    );
    expect(html).not.toContain('step:');
    expect(html).toContain('get-started-status');
  });

  it('tells how many questions are left on the entry page', () => {
    const render = (initialSelection: Selection) =>
      renderToStaticMarkup(
        createElement(GetStarted, { lang: 'en', initialSelection }, steps),
      );
    expect(render({ platform: 'desktop' })).toContain('2 questions left');
    expect(render({ platform: 'web', scene: 'test' })).toContain(
      '1 question left',
    );
  });

  it('links every setup path from the entry page index', () => {
    for (const lang of ['en', 'zh'] as const) {
      const html = renderToStaticMarkup(
        createElement(GetStartedPathIndex, { lang }),
      );
      const links = Array.from(
        html.matchAll(/href="([^"]+)"/g),
        (match) => match[1],
      );
      expect(links).toEqual(
        expect.arrayContaining(
          allPaths.map((path) => getStartedRoute(lang, path)),
        ),
      );
      expect(links).toHaveLength(allPaths.length);
    }
  });

  it('shows the Vitest sections for the platform of the path', () => {
    const html = renderToStaticMarkup(
      createElement(
        GetStarted,
        {
          lang: 'en',
          path: { scene: 'sdk', platform: 'ios', model: 'chatgpt' },
        },
        createElement(
          GetStartedStep,
          { id: 'sdk-write' },
          createElement(
            GetStartedSdkPlatform,
            null,
            (['android', 'ios', 'harmonyos', 'desktop'] as const).map(
              (platform) =>
                createElement(
                  SdkPlatformContent,
                  { key: platform, platform },
                  `vitest:${platform}`,
                ),
            ),
          ),
        ),
      ),
    );
    expect(html).toContain('vitest:ios');
    expect(html.match(/vitest:/g)).toHaveLength(1);
  });

  it('reports steps placed outside GetStarted', () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(GetStartedStep, { id: 'install-node' }, 'step'),
      ),
    ).toThrow('Get started steps must be inside GetStarted');
  });
});

describe('get started model question', () => {
  const render = (llm?: (typeof llms)[number]) =>
    renderToStaticMarkup(
      createElement(
        GetStarted,
        {
          lang: 'en',
          path: { scene: 'test', platform: 'android', model: 'api-key', llm },
        },
        createElement(GetStartedStep, { id: 'model-api-key' }, [
          createElement(GetStartedLlmPicker, { key: 'picker' }),
          ...llms.map((id) =>
            createElement(GetStartedWhen, { key: id, llm: id }, `card:${id}`),
          ),
        ]),
      ),
    );

  it('asks for the platform first and names its test runner', () => {
    const html = render();
    expect(
      html.indexOf('Which platform do you want to automate?'),
    ).toBeLessThan(html.indexOf('What do you want to do first?'));
    expect(html).toContain(
      'Add visual actions and assertions with Rstest or Vitest.',
    );
    const web = renderToStaticMarkup(
      createElement(GetStarted, {
        lang: 'zh',
        initialSelection: { platform: 'web' },
      }),
    );
    expect(web.match(/<fieldset/g)).toHaveLength(2);
    expect(web).toContain('在 Playwright Test 中加入视觉操作与断言。');
  });

  it('lists ChatGPT before the API Key option', () => {
    const html = render();
    expect(html.indexOf('ChatGPT subscription')).toBeLessThan(
      html.indexOf('Model API Key'),
    );
  });

  it('shows the steps with a default model and picks inside the model step', () => {
    const html = render();
    // Three gating questions plus the picker inside the step.
    expect(html.match(/<fieldset/g)).toHaveLength(4);
    expect(html.match(/get-started-question-pending/g)).toBeNull();
    expect(html.indexOf('Step 1')).toBeLessThan(
      html.indexOf('Which model do you want to use?'),
    );
    expect(html).toContain(llmLabels.qwen);
    expect(html).toContain(`card:${defaultLlm}`);
    expect(html.match(/card:/g)).toHaveLength(1);
  });

  it('shows only the selected model card', () => {
    const html = render('gpt');
    expect(html).toContain('card:gpt');
    expect(html.match(/card:/g)).toHaveLength(1);
  });

  it('skips the model picker for a ChatGPT subscription', () => {
    const html = renderToStaticMarkup(
      createElement(GetStarted, {
        lang: 'en',
        initialSelection: { scene: 'test', platform: 'web', model: 'chatgpt' },
      }),
    );
    expect(html.match(/<fieldset/g)).toHaveLength(3);
    expect(html).not.toContain('Which model do you want to use?');
  });
});

describe('get started path pages', () => {
  it('generates one page per path and language', () => {
    const pages = getStartedPages();
    expect(pages).toHaveLength(allPaths.length * 2);
    expect(new Set(pages.map((page) => page.routePath)).size).toBe(
      pages.length,
    );
  });

  it('renders the shared steps for a fixed path', () => {
    const path = { platform: 'ios', scene: 'test', model: 'chatgpt' } as const;
    const content = getStartedPageContent('zh', path);
    expect(content).toContain(`title: "${pathTitle('zh', path)}"`);
    expect(content).toContain(`# ${pathTitle('zh', path)} {#get-started}`);
    expect(content).toContain(`path={${JSON.stringify(path)}}`);
    const steps = content.match(/import Steps from "([^"]+)";/)?.[1];
    expect(steps).toMatch(/docs\/zh\/common\/get-started-steps\.mdx$/);
    expect(() => readFileSync(steps as string)).not.toThrow();
  });
});

describe('get started Markdown output', () => {
  afterEach(() => {
    rstest.unstubAllEnvs();
  });

  const path = {
    platform: 'android',
    scene: 'playground',
    model: 'api-key',
  } as const;

  // SSG-MD passes Markdown blocks that contain JSX to the steps as text.
  const nextSteps = createElement(
    GetStartedStep,
    { id: 'next-steps' },
    createElement(
      GetStartedWhen,
      { scene: 'playground' },
      '- **Write repeatable cases**: <GetStartedSwitch scene="test">Create a project</GetStartedSwitch>.',
    ),
  );

  it('links to other usages and leaves out step labels', () => {
    rstest.stubEnv('SSG_MD', 'true');
    for (const lang of ['en', 'zh'] as const) {
      const html = renderToStaticMarkup(
        createElement(GetStarted, { lang, path }, nextSteps),
      );
      const route = getStartedRoute(lang, { ...path, scene: 'test' });
      expect(html).toContain(`[Create a project](${route}.md)`);
      expect(html).not.toContain('GetStartedSwitch');
      expect(html).not.toContain('get-started-step-label');
      expect(html).not.toContain('<fieldset');
    }
  });

  it('rejects an unknown usage in a switch', () => {
    rstest.stubEnv('SSG_MD', 'true');
    expect(() =>
      renderToStaticMarkup(
        createElement(
          GetStarted,
          { lang: 'en', path },
          createElement(
            GetStartedWhen,
            { scene: 'playground' },
            '<GetStartedSwitch scene="unknown">x</GetStartedSwitch>',
          ),
        ),
      ),
    ).toThrow('Unknown GetStartedSwitch scene: unknown');
  });

  it('keeps the switch tag as a component on the HTML page', () => {
    const html = renderToStaticMarkup(
      createElement(GetStarted, { lang: 'en', path }, nextSteps),
    );
    expect(html).toContain('get-started-step-label');
  });

  it('shows interactive-only and Markdown-only content in its own output', () => {
    const blocks = [
      createElement(GetStartedHtmlOnly, { key: 'html' }, 'html-only'),
      createElement(GetStartedMarkdownOnly, { key: 'md' }, 'markdown-only'),
    ];
    const html = renderToStaticMarkup(createElement('div', null, blocks));
    expect(html).toContain('html-only');
    expect(html).not.toContain('markdown-only');

    rstest.stubEnv('SSG_MD', 'true');
    const markdown = renderToStaticMarkup(createElement('div', null, blocks));
    expect(markdown).not.toContain('html-only');
    expect(markdown).toContain('markdown-only');
  });

  it('points path pages to the questions only on the HTML page', () => {
    const en = getStartedPageContent('en', path);
    const html = en.slice(
      en.indexOf('<GetStartedHtmlOnly>'),
      en.indexOf('</GetStartedHtmlOnly>'),
    );
    const markdown = en.slice(
      en.indexOf('<GetStartedMarkdownOnly>'),
      en.indexOf('</GetStartedMarkdownOnly>'),
    );
    expect(html).toContain('change the answers below or see [all setup paths]');
    expect(markdown).toContain(
      'To choose another combination, see [all setup paths]',
    );
    expect(markdown).not.toContain('answers below');
    // The back-to-top link points to the questions too.
    const backToTop = en.slice(en.lastIndexOf('<GetStartedHtmlOnly>'));
    expect(backToTop).toContain('[Back to top](#get-started)');

    const zh = getStartedPageContent('zh', path);
    expect(zh).toContain('请修改下方的选择，或查看[全部配置路径]');
    expect(zh).toContain('请查看[全部配置路径]');
  });
});
