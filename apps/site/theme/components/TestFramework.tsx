import { useState } from 'react';
import { useI18n } from '../i18n';
import './TestFramework.css';

type StepKind = 'ai' | 'node';

interface YamlLine {
  indent: number;
  key?: string;
  value?: string;
  item?: boolean;
  kind?: StepKind;
}

export function TestFramework({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const [focus, setFocus] = useState<StepKind | null>(null);

  const lines: YamlLine[] = [
    { indent: 0, key: 'beforeEach' },
    {
      indent: 2,
      item: true,
      key: 'order.prepare',
      value: '{ status: paid }',
      kind: 'node',
    },
    {
      indent: 2,
      item: true,
      key: 'gotoUrl',
      value: '${shopUrl}/orders/latest',
      kind: 'node',
    },
    { indent: 0 },
    { indent: 0, key: 'cases' },
    { indent: 2, item: true, key: 'name', value: t('frameworkCaseName') },
    { indent: 4, key: 'steps' },
    {
      indent: 6,
      item: true,
      key: 'aiAct',
      value: t('frameworkCaseAct'),
      kind: 'ai',
    },
    {
      indent: 6,
      item: true,
      key: 'aiAssert',
      value: t('frameworkCaseAssert'),
      kind: 'ai',
    },
    {
      indent: 6,
      item: true,
      key: 'order.checkRefund',
      value: '{ status: refunding }',
      kind: 'node',
    },
    { indent: 0 },
    { indent: 0, key: 'afterEach' },
    { indent: 2, item: true, key: 'clearCookies', value: '{}', kind: 'node' },
  ];

  const legend: { kind: StepKind; title: string; description: string }[] = [
    {
      kind: 'ai',
      title: t('frameworkAiTitle'),
      description: t('frameworkAiDesc'),
    },
    {
      kind: 'node',
      title: t('frameworkNodeTitle'),
      description: t('frameworkNodeDesc'),
    },
  ];

  return (
    <section
      className="home-feature home-framework"
      aria-labelledby={hideHeading ? undefined : 'home-framework-title'}
    >
      <div className="home-feature__inner home-framework__layout">
        <div className="home-framework__copy">
          {!hideHeading && (
            <header className="home-feature__heading-block">
              <span className="home-feature__eyebrow">
                <span aria-hidden="true">{'//'}</span>@midscene/test
              </span>
              <h2 id="home-framework-title">{t('frameworkHeading')}</h2>
            </header>
          )}

          <ul
            className="home-framework__legend"
            aria-label={t('frameworkLegendLabel')}
          >
            {legend.map((item) => (
              <li key={item.kind}>
                <button
                  type="button"
                  className={`home-framework__legend-item home-framework__legend-item--${item.kind}`}
                  aria-pressed={focus === item.kind}
                  onClick={() => setFocus(item.kind)}
                  onMouseEnter={() => setFocus(item.kind)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(item.kind)}
                  onBlur={() => setFocus(null)}
                >
                  <span className="home-framework__tag" aria-hidden="true">
                    {item.kind === 'ai' ? 'AI' : 'Node'}
                  </span>
                  <span className="home-framework__legend-text">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <figure
          className="home-framework__file"
          data-focus={focus ?? undefined}
        >
          <figcaption className="home-framework__file-bar">
            <span className="home-framework__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            cases/refund.yaml
          </figcaption>
          <pre className="home-framework__code">
            <code>
              {lines.map((line, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static lines
                  key={index}
                  className="home-framework__line"
                  data-kind={line.kind}
                >
                  <span className="home-framework__line-no" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="home-framework__line-text">
                    {' '.repeat(line.indent)}
                    {line.item && (
                      <span className="home-framework__punct">- </span>
                    )}
                    {line.key && (
                      <>
                        <span className="home-framework__key">{line.key}</span>
                        <span className="home-framework__punct">:</span>
                      </>
                    )}
                    {line.value && (
                      <span className="home-framework__value">
                        {` ${line.value}`}
                      </span>
                    )}
                  </span>
                  {line.kind && (
                    <span className="home-framework__tag">
                      {line.kind === 'ai' ? 'AI' : 'Node'}
                    </span>
                  )}
                </span>
              ))}
            </code>
          </pre>
        </figure>
      </div>
    </section>
  );
}
