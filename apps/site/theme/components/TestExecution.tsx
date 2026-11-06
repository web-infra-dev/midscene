import {
  ArrowRight,
  Check,
  FileJson,
  FileText,
  Globe,
  Minus,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import { FeatureCard, FeatureCardGrid } from './FeatureCard';
import './TestExecution.css';

type Translate = ReturnType<typeof useI18n>;

function WindowDots() {
  return (
    <span className="home-execution__dots">
      <span />
      <span />
      <span />
    </span>
  );
}

function LifecycleVisual({ t }: { t: Translate }) {
  const cases = ['Case 1', 'Case 2'];

  return (
    <div className="home-execution__lifecycle">
      <div className="home-execution__scope" data-level="project">
        <div className="home-execution__scope-head">
          <span className="home-execution__scope-name">
            {t('executionScopeProject')}
          </span>
          <span className="home-execution__hook">setup</span>
          <span className="home-execution__scope-fill" />
          <span className="home-execution__hook">onTeardown</span>
        </div>

        <div className="home-execution__scope" data-level="file">
          <div className="home-execution__scope-head">
            <span className="home-execution__scope-name">cases/order.yaml</span>
            <span className="home-execution__hook">fileSetup</span>
            <span className="home-execution__hook">beforeAll</span>
            <span className="home-execution__scope-fill" />
            <span className="home-execution__hook">afterAll</span>
          </div>

          {cases.map((name) => (
            <div
              className="home-execution__scope home-execution__case"
              data-level="case"
              key={name}
            >
              <span className="home-execution__scope-name">{name}</span>
              <span className="home-execution__hook">beforeEach</span>
              <ArrowRight size={12} strokeWidth={1.5} />
              <span className="home-execution__step">aiAct</span>
              <span className="home-execution__step">aiAssert</span>
              <ArrowRight size={12} strokeWidth={1.5} />
              <span className="home-execution__hook">afterEach</span>
              <span className="home-execution__scope-fill" />
              <Check
                className="home-execution__passed"
                size={14}
                strokeWidth={2.5}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="home-execution__interrupt">
        <span className="home-execution__chip">
          {t('executionInterrupted')}
        </span>
        <ArrowRight size={12} strokeWidth={1.5} />
        <span className="home-execution__chip home-execution__chip--passed">
          <Check size={12} strokeWidth={2.5} />
          {t('executionCleanupRuns')}
        </span>
      </div>
    </div>
  );
}

function RetryVisual({ t }: { t: Translate }) {
  return (
    <div className="home-execution__retry">
      <div className="home-execution__retry-head">
        <span>{t('frameworkCaseName')}</span>
        <span className="home-execution__chip">retry: 1</span>
      </div>

      <div className="home-execution__attempt" data-status="failed">
        <X size={14} strokeWidth={2.5} />
        <div>
          <strong>{t('executionAttempt1')}</strong>
          <span>{t('executionAttemptTimeout')}</span>
        </div>
        <span className="home-execution__hook">afterEach</span>
      </div>

      <div className="home-execution__retry-link">
        <RotateCcw size={12} strokeWidth={2} />
        {t('executionRetryAfterCleanup')}
      </div>

      <div className="home-execution__attempt" data-status="passed">
        <Check size={14} strokeWidth={2.5} />
        <div>
          <strong>{t('executionAttempt2')}</strong>
          <span>{t('executionAttemptPassed')}</span>
        </div>
        <span className="home-execution__hook">afterEach</span>
      </div>

      <div className="home-execution__config">
        <span className="home-execution__chip">testTimeout</span>
        <span className="home-execution__chip">continue-on-error</span>
        <span className="home-execution__chip">bail</span>
      </div>
    </div>
  );
}

function ConcurrencyVisual({ t }: { t: Translate }) {
  const running = [
    { file: 'search.yaml', progress: 80 },
    { file: 'cart.yaml', progress: 45 },
    { file: 'refund.yaml', progress: 65 },
  ];

  return (
    <div className="home-execution__concurrency">
      <div className="home-execution__retry-head">
        <span>{t('executionConcurrencyRunning')}</span>
        <span className="home-execution__chip">maxConcurrentFiles: 3</span>
      </div>

      <ul className="home-execution__slots">
        {running.map(({ file, progress }) => (
          <li key={file}>
            <code>{file}</code>
            <span className="home-execution__env">
              <Globe size={11} strokeWidth={2} />
              {t('executionConcurrencyEnv')}
            </span>
            <span className="home-execution__progress">
              <span style={{ width: `${progress}%` }} />
            </span>
          </li>
        ))}
      </ul>

      <div className="home-execution__queue">
        <span>{t('executionConcurrencyQueued')}</span>
        <code>profile.yaml</code>
        <code>orders.yaml</code>
      </div>
    </div>
  );
}

function ReportVisual({ t }: { t: Translate }) {
  const steps = [
    { status: 'passed', key: 'order.prepare', value: '{ status: paid }' },
    { status: 'passed', key: 'aiAct', value: t('frameworkCaseAct') },
    { status: 'failed', key: 'aiAssert', value: t('frameworkCaseAssert') },
    {
      status: 'skipped',
      key: 'order.checkRefund',
      value: t('executionReportSkipped'),
    },
  ] as const;

  return (
    <div className="home-execution__report">
      <div className="home-execution__report-window">
        <div className="home-execution__bar">
          <WindowDots />
          <span className="home-execution__url">
            report.html<mark>#runner-step=last-error</mark>
          </span>
        </div>
        <div className="home-execution__report-body">
          <div className="home-execution__report-steps">
            <div className="home-execution__report-case">
              {t('frameworkCaseName')}
            </div>
            <ol>
              {steps.map((step) => (
                <li key={step.key} data-status={step.status}>
                  {step.status === 'passed' && (
                    <Check size={12} strokeWidth={2.5} />
                  )}
                  {step.status === 'failed' && (
                    <X size={12} strokeWidth={2.5} />
                  )}
                  {step.status === 'skipped' && (
                    <Minus size={12} strokeWidth={2.5} />
                  )}
                  <span className="home-execution__report-key">{step.key}</span>
                  <span className="home-execution__report-value">
                    {step.value}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="home-execution__report-detail">
            <div className="home-execution__report-label">
              {t('executionReportScreenshot')}
              <span className="home-execution__replay">
                <Play size={10} strokeWidth={2.5} />
                {t('executionReportReplay')}
              </span>
            </div>
            <div className="home-execution__screenshot">
              <span className="home-execution__skeleton" />
              <span className="home-execution__skeleton home-execution__skeleton--short" />
              <span className="home-execution__screenshot-target" />
              <span className="home-execution__skeleton home-execution__skeleton--short" />
            </div>
            <div className="home-execution__report-label">
              {t('executionReportError')}
            </div>
            <span className="home-execution__skeleton home-execution__skeleton--error" />
          </div>
        </div>
      </div>

      <div className="home-execution__outputs">
        <span className="home-execution__outputs-label">
          {t('executionReportMachine')}
        </span>
        <span className="home-execution__chip">
          <FileJson size={12} strokeWidth={1.75} />
          summary.json
        </span>
        <span className="home-execution__chip">
          <FileText size={12} strokeWidth={1.75} />
          result.md
        </span>
      </div>
    </div>
  );
}

export function TestExecution({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const tUrl = useI18nUrl();

  return (
    <section
      className="home-feature home-execution"
      aria-labelledby={hideHeading ? undefined : 'home-execution-title'}
    >
      <div className="home-feature__inner">
        {!hideHeading && (
          <header className="home-feature__heading-block">
            <span className="home-feature__eyebrow">
              <span aria-hidden="true">{'//'}</span>
              {t('executionEyebrow')}
            </span>
            <h2 id="home-execution-title">{t('executionHeading')}</h2>
          </header>
        )}

        <FeatureCardGrid>
          <FeatureCard
            wide
            href={tUrl(t('executionLifecycleHref'))}
            title={t('executionLifecycleTitle')}
            description={t('executionLifecycleDesc')}
            actionLabel={t('executionLifecycleLink')}
          >
            <LifecycleVisual t={t} />
          </FeatureCard>
          <FeatureCard
            href={tUrl(t('executionRetryHref'))}
            title={t('executionRetryTitle')}
            description={t('executionRetryDesc')}
            actionLabel={t('executionRetryLink')}
          >
            <RetryVisual t={t} />
          </FeatureCard>
          <FeatureCard
            href={tUrl(t('executionConcurrencyHref'))}
            title={t('executionConcurrencyTitle')}
            description={t('executionConcurrencyDesc')}
            actionLabel={t('executionConcurrencyLink')}
          >
            <ConcurrencyVisual t={t} />
          </FeatureCard>
          <FeatureCard
            wide
            href={tUrl(t('executionReportHref'))}
            title={t('executionReportTitle')}
            description={t('executionReportDesc')}
            actionLabel={t('executionReportLink')}
          >
            <ReportVisual t={t} />
          </FeatureCard>
        </FeatureCardGrid>
      </div>
    </section>
  );
}
