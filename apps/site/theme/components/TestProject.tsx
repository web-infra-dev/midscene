import { CodeBlockRuntime } from '@rspress/core/theme';
import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import { Fragment } from 'react';
import { useI18n, useI18nUrl } from '../i18n';
import './TestFramework.css';
import './TestProject.css';

export function TestProject() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const prepareDescription = t('projectNodeDescription');

  const cards = [
    {
      role: t('projectNodesRole'),
      file: 'nodes/order.ts',
      description: t('projectNodesDesc'),
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
      role: t('projectSpecRole'),
      file: 'midscene-node-spec.md',
      description: t('projectSpecDesc'),
      lang: 'markdown',
      code: `### \`order.prepare\`

${prepareDescription}

#### Input Schema

\`\`\`json
{
  "properties": {
    "status": { "const": "paid" }
  },
  "required": ["status"]
}
\`\`\``,
    },
    {
      role: t('projectCasesRole'),
      file: 'cases/refund.yaml',
      description: t('projectCasesDesc'),
      lang: 'yaml',
      code: `beforeEach:
  - order.prepare:
      status: paid

cases:
  - name: ${t('projectCaseName')}
    steps:
      - aiAct: ${t('projectCaseAct')}
      - aiAssert: ${t('projectCaseAssert')}`,
    },
  ];
  return (
    <section
      className="home-feature home-project"
      aria-labelledby="home-project-title"
    >
      <div className="home-feature__inner">
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

        <ol className="home-project__flow">
          {cards.map((card, index) => (
            <Fragment key={card.file}>
              <li className="home-project__card">
                <div className="home-project__card-head">
                  <span className="home-project__role">{card.role}</span>
                  <p>{card.description}</p>
                </div>
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
              {index < cards.length - 1 && (
                <li className="home-project__connector" aria-hidden="true">
                  <ArrowRight size={18} strokeWidth={1.5} />
                </li>
              )}
            </Fragment>
          ))}
        </ol>

        <Link
          className="home-feature__action home-project__link"
          href={tUrl('/midscene-test/extend')}
        >
          <span>{t('projectLink')}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
