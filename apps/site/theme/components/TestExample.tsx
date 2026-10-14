import { CodeBlockRuntime } from '@rspress/core/theme';
import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useI18n, useI18nUrl } from '../i18n';
import { SectionDivider } from './SectionDivider';
import { handleTabKeyDown } from './tab-keys';
import './TestExample.css';

export function TestExample() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const [activeIndex, setActiveIndex] = useState(0);
  const name = JSON.stringify(t('exampleCase'));
  const act = JSON.stringify(t('exampleAct'));
  const wait = JSON.stringify(t('exampleWait'));
  const assert = JSON.stringify(t('exampleAssert'));

  const styles = [
    {
      id: 'yaml',
      label: t('exampleYamlTab'),
      file: 'cases/search.yaml',
      lang: 'yaml',
      command: 'pnpm exec midscene-test',
      description: t('exampleYamlDesc'),
      href: '/midscene-test/use',
      linkLabel: t('exampleYamlLink'),
      code: `beforeEach:
  - gotoUrl: https://your-shop.example

cases:
  - name: ${name}
    steps:
      - aiAct: ${act}
      - aiWaitFor: ${wait}
      - aiAssert: ${assert}`,
    },
    {
      id: 'playwright',
      label: 'Playwright Test',
      file: 'e2e/search.spec.ts',
      lang: 'typescript',
      command: 'pnpm exec playwright test',
      description: t('examplePlaywrightDesc'),
      href: '/integrate-with-playwright',
      linkLabel: t('examplePlaywrightLink'),
      code: `// ${t('exampleFixtureNote')}
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://your-shop.example');
});

test(${name}, async ({ aiAct, aiWaitFor, aiAssert }) => {
  await aiAct(${act});
  await aiWaitFor(${wait});
  await aiAssert(${assert});
});`,
    },
    {
      id: 'vitest',
      label: 'Vitest + JavaScript',
      file: 'search.test.js',
      lang: 'javascript',
      command: 'pnpm exec vitest run',
      description: t('exampleVitestDesc'),
      href: '/reference/',
      linkLabel: t('exampleVitestLink'),
      code: `import { test } from 'vitest';
import { PlaywrightAgent } from '@midscene/web/playwright';

// ${t('exampleSetupOmitted')}
test(${name}, async () => {
  const agent = new PlaywrightAgent(page);
  await agent.aiAct(${act});
  await agent.aiWaitFor(${wait});
  await agent.aiAssert(${assert});
}, 180_000);`,
    },
  ];
  const active = styles[activeIndex];

  return (
    <>
      <section
        className="home-feature home-example"
        aria-labelledby="home-example-title"
      >
        <div className="home-feature__inner">
          <header className="home-feature__header">
            <div className="home-feature__heading-block">
              <span className="home-feature__eyebrow">
                <span aria-hidden="true">{'//'}</span>
                {t('exampleEyebrow')}
              </span>
              <h2 id="home-example-title">{t('exampleHeading')}</h2>
            </div>
            <p className="home-example__lead">{t('exampleDesc')}</p>
          </header>

          <div className="home-example__window">
            <div className="home-example__toolbar">
              <div
                className="home-example__switch"
                role="tablist"
                aria-label={t('exampleStylesLabel')}
              >
                {styles.map((style, index) => (
                  <button
                    key={style.id}
                    id={`home-example-tab-${style.id}`}
                    type="button"
                    role="tab"
                    aria-selected={index === activeIndex}
                    aria-controls="home-example-panel"
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) =>
                      handleTabKeyDown(
                        event,
                        activeIndex,
                        styles.length,
                        'horizontal',
                        setActiveIndex,
                      )
                    }
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              <span className="home-example__file">{active.file}</span>
            </div>

            <div
              id="home-example-panel"
              className="home-example__panel"
              role="tabpanel"
              aria-labelledby={`home-example-tab-${active.id}`}
            >
              <CodeBlockRuntime
                key={active.id}
                lang={active.lang}
                code={active.code}
                wrapCode
                codeButtonGroupProps={{ showWrapCodeButton: false }}
              />
            </div>

            <div className="home-example__footer">
              <p>{active.description}</p>
              <div className="home-example__meta">
                <code>
                  <span aria-hidden="true">$ </span>
                  {active.command}
                </code>
                <Link href={tUrl(active.href)}>
                  {active.linkLabel}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <SectionDivider className="home-feature__divider" />
    </>
  );
}
