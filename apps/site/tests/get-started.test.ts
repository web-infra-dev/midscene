import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GetStarted,
  GetStartedStep,
  GetStartedWhen,
} from '../theme/components/GetStarted';
import {
  type CompleteSelection,
  isComplete,
  llms,
  models,
  parseSelection,
  planSteps,
  platforms,
  scenes,
  serializeSelection,
  stepIds,
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
  playground: ['playground-web', 'playground-device'],
  test: ['test-run'],
  sdk: ['sdk-integrate'],
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
      const playground = selection.scene === 'playground';
      expect(steps.includes('next-steps')).toBe(!playground);
      expect(
        steps.filter((id) => modelSteps.includes(id as never)),
      ).toHaveLength(1);
      expect(
        steps.filter((id) => deviceSteps.includes(id as never)),
      ).toHaveLength(selection.platform === 'web' ? 0 : 1);
      expect(finalSteps[selection.scene]).toContain(
        steps.at(playground ? -1 : -2),
      );
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

  it('asks for a model only on the API Key path', () => {
    const base = { scene: 'test', platform: 'android' } as const;
    expect(isComplete({ ...base, model: 'chatgpt' })).toBe(true);
    expect(isComplete({ ...base, model: 'api-key' })).toBe(false);
    expect(isComplete({ ...base, model: 'api-key', llm: 'gpt' })).toBe(true);
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
});

describe('get started pages', () => {
  for (const lang of ['en', 'zh'] as const) {
    it(`defines every planned step in the ${lang} page order`, () => {
      const page = readFileSync(
        new URL(`../docs/${lang}/get-started.mdx`, import.meta.url),
        'utf8',
      );
      const ids = Array.from(
        page.matchAll(/<GetStartedStep id="([^"]+)">/g),
        (match) => match[1],
      );
      expect(ids).toEqual([...stepIds]);

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
        expect(page).toContain(`./common/model-cards/${id}.mdx`);
      }
      for (const [, fragment] of page.matchAll(
        /from '\.\/(common\/[^']+\.mdx)'/g,
      )) {
        expect(() =>
          readFileSync(new URL(`../docs/${lang}/${fragment}`, import.meta.url)),
        ).not.toThrow();
      }
    });
  }
});

describe('get started component', () => {
  const steps = stepIds.map((id) =>
    createElement(GetStartedStep, { key: id, id }, `step:${id}`),
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
      createElement(GetStarted, { lang: 'zh', initialSelection: selection }, [
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
      expect(html.includes(`step:${id}<`)).toBe(planned.includes(id));
    }
    expect(html).toContain('when:android');
    expect(html).not.toContain('when:web');
    expect(html).toContain('下方已列出你的配置步骤。');
    expect(html).not.toContain(`${planned.length} 个步骤`);
    expect(html).toContain('第 1 步</p>step:install-node<');
    expect(html).toContain(`第 ${planned.length} 步</p>step:next-steps<`);
    expect(html).toContain('桌面端');
    expect(html.match(/checked=""/g)).toHaveLength(3);
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
          initialSelection: {
            scene: 'test',
            platform: 'android',
            model: 'api-key',
            llm,
          },
        },
        createElement(
          GetStartedStep,
          { id: 'model-api-key' },
          llms.map((id) =>
            createElement(GetStartedWhen, { key: id, llm: id }, `card:${id}`),
          ),
        ),
      ),
    );

  it('asks for the platform first and names its test runner', () => {
    const html = render();
    expect(
      html.indexOf('Which platform do you want to automate?'),
    ).toBeLessThan(html.indexOf('What do you want to do first?'));
    expect(html).toContain('Add visual actions and assertions to Vitest.');
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

  it('adds a model question and waits for an answer', () => {
    const html = render();
    expect(html.match(/<fieldset/g)).toHaveLength(4);
    expect(html).toContain('Which model do you want to use?');
    expect(html).toContain('Qwen3.7 Plus');
    expect(html).not.toContain('card:');
  });

  it('shows only the selected model card', () => {
    const html = render('gpt');
    expect(html).toContain('card:gpt');
    expect(html.match(/card:/g)).toHaveLength(1);
  });

  it('skips the model question for a ChatGPT subscription', () => {
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
