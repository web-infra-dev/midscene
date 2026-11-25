import { useEffect, useState } from 'react';
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
  const [focus, setFocus] = useState<StepKind>('ai');
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      setFocus((prev) => (prev === 'ai' ? 'node' : 'ai'));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [focus, paused]);

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
      <div className="home-feature__inner">
        {!hideHeading && (
          <header className="home-feature__heading-block">
            <span className="home-feature__eyebrow">
              <span aria-hidden="true">{'//'}</span>@midscene/test
            </span>
            <h2 id="home-framework-title">{t('frameworkHeading')}</h2>
          </header>
        )}

        <figure
          className="home-framework__panel"
          data-focus={focus}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <figcaption className="home-framework__file-bar">
            <span className="home-framework__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="home-framework__filename">cases/refund.yaml</span>
            <span className="home-framework__bar-tags" aria-hidden="true">
              <span
                className="home-framework__tag home-framework__tag--ai"
                data-active={focus === 'ai'}
              >
                {t('frameworkAiTag')}
              </span>
              <span
                className="home-framework__tag home-framework__tag--node"
                data-active={focus === 'node'}
              >
                {t('frameworkNodeTag')}
              </span>
            </span>
          </figcaption>

          <pre className="home-framework__code">
            <code>
              {lines.map((line, index) => (
                <span
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
                    <span
                      className={`home-framework__tag home-framework__tag--${line.kind}`}
                    >
                      {t(
                        line.kind === 'ai'
                          ? 'frameworkAiTag'
                          : 'frameworkNodeTag',
                      )}
                    </span>
                  )}
                </span>
              ))}
            </code>
          </pre>

          <div className="home-framework__footer">
            {legend.map((item) => (
              <button
                key={item.kind}
                type="button"
                className="home-framework__footer-item"
                data-kind={item.kind}
                data-active={focus === item.kind}
                aria-pressed={focus === item.kind}
                onClick={() => setFocus(item.kind)}
              >
                <div className="home-framework__footer-head">
                  <span
                    className={`home-framework__tag home-framework__tag--${item.kind}`}
                  >
                    {t(
                      item.kind === 'ai'
                        ? 'frameworkAiTag'
                        : 'frameworkNodeTag',
                    )}
                  </span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.description}</p>
              </button>
            ))}
          </div>
        </figure>
      </div>
    </section>
  );
}
