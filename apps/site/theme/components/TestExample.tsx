import { CodeBlockRuntime } from '@rspress/core/theme';
import { useI18n } from '../i18n';
import { SectionDivider } from './SectionDivider';
import './TestExample.css';

export function TestExample() {
  const t = useI18n();
  const name = JSON.stringify(t('exampleCase'));
  const act = JSON.stringify(t('exampleAct'));
  const wait = JSON.stringify(t('exampleWait'));
  const assert = JSON.stringify(t('exampleAssert'));
  const yaml = `beforeEach:
  - gotoUrl: https://your-shop.example

cases:
  - name: ${name}
    steps:
      - aiAct: ${act}
      - aiWaitFor: ${wait}
      - aiAssert: ${assert}`;
  const javascript = `import { test } from 'vitest';
import { PlaywrightAgent } from '@midscene/web/playwright';

// ${t('exampleSetupOmitted')}
test(${name}, async () => {
  const agent = new PlaywrightAgent(page);
  await agent.aiAct(${act});
  await agent.aiWaitFor(${wait});
  await agent.aiAssert(${assert});
}, 180_000);`;

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
          </header>

          <div className="home-example__codes">
            <div className="home-example__code">
              <h3>{t('exampleYamlTitle')}</h3>
              <CodeBlockRuntime lang="yaml" code={yaml} wrapCode />
            </div>
            <div className="home-example__code">
              <h3>Vitest + JavaScript</h3>
              <CodeBlockRuntime lang="javascript" code={javascript} wrapCode />
            </div>
          </div>
        </div>
      </section>
      <SectionDivider className="home-feature__divider" />
    </>
  );
}
