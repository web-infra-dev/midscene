import { CodeBlockRuntime } from '@rspress/core/theme';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n';
import './TestFramework.css';
import './TestProject.css';

export function TestProject({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const prepareDescription = t('projectNodeDescription');

  const cards = [
    {
      file: 'nodes/order.ts',
      lang: 'typescript',
      code: `defineNode({
  name: 'order.prepare',
  description: ${JSON.stringify(prepareDescription)},
  inputSchema: z.strictObject({
    status: z.literal('paid'),
  }),
  async execute({ input }) {
    await orders.create(input);
  },
});`,
    },
    {
      file: 'midscene-node-spec.md',
      lang: 'markdown',
      code: `### order.prepare
${prepareDescription}
- status: "paid"`,
    },
    {
      file: 'case.yaml',
      lang: 'yaml',
      code: `steps:
  - order.prepare:
      status: paid`,
    },
  ];
  return (
    <section
      className="home-feature home-project"
      aria-labelledby={hideHeading ? undefined : 'home-project-title'}
    >
      <div className="home-feature__inner">
        {!hideHeading && (
          <header className="home-project__header">
            <div className="home-feature__heading-block">
              <span className="home-feature__eyebrow">
                <span aria-hidden="true">{'//'}</span>
                {t('projectEyebrow')}
              </span>
              <h2 id="home-project-title">{t('projectHeading')}</h2>
            </div>
            <p className="home-project__lead">{t('projectDesc')}</p>
          </header>
        )}

        <ol className="home-project__flow">
          {cards.map((card, index) => (
            <li className="home-project__card" key={card.file}>
              {index > 0 && (
                <ArrowRight
                  className="home-project__arrow"
                  size={28}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
              <div className="home-project__card-code">
                <div className="home-project__card-bar">{card.file}</div>
                <CodeBlockRuntime
                  lang={card.lang}
                  code={card.code}
                  wrapCode
                  codeButtonGroupProps={{ showWrapCodeButton: false }}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
