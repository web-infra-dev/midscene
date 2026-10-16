import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n, useI18nUrl } from '../i18n';
import { FeatureCard } from './FeatureCard';
import { HomeChapter } from './HomeChapter';
import { PlatformTable } from './PlatformTable';
import { SectionDivider } from './SectionDivider';
import { TestFramework } from './TestFramework';
import { TestProject } from './TestProject';
import { TestingToolkit } from './TestingToolkit';
import { TiltCard } from './TiltCard';

interface FeatureSectionProps {
  hideHeading?: boolean;
  eyebrow: string;
  heading: string;
  descriptions?: string[];
  variant: 'platforms' | 'models' | 'toolkit' | 'benchmarks';
  action?: {
    href: string;
    label: string;
    description?: string;
  };
  children: ReactNode;
}

function FeatureSection({
  hideHeading = false,
  eyebrow,
  heading,
  descriptions = [],
  variant,
  action,
  children,
}: FeatureSectionProps) {
  return (
    <section className={`home-feature home-feature--${variant}`}>
      <div className="home-feature__inner">
        {!hideHeading && (
          <header className="home-feature__header">
            <div className="home-feature__heading-block">
              <span className="home-feature__eyebrow">
                <span aria-hidden="true">{'//'}</span>
                <span>{eyebrow}</span>
              </span>
              <h2>{heading}</h2>
            </div>

            {(descriptions.length > 0 || action) && (
              <div className="home-feature__details">
                <ul>
                  {descriptions.map((description) => (
                    <li key={description}>
                      <span>{description}</span>
                    </li>
                  ))}
                </ul>
                {action && (
                  <Link
                    className="home-feature__action"
                    href={action.href}
                    title={action.description}
                  >
                    <span>{action.label}</span>
                    <ArrowRight
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </Link>
                )}
              </div>
            )}
          </header>
        )}

        {children}
      </div>
    </section>
  );
}

interface BenchmarkLinkCardProps {
  href: string;
  score: string;
  title: string;
  details: string;
}

function BenchmarkLinkCard({
  href,
  score,
  title,
  details,
}: BenchmarkLinkCardProps) {
  return (
    <TiltCard href={href} className="home-benchmark-card">
      <div className="home-benchmark-card__visual">
        <img
          className="home-benchmark-card__mark"
          src="/images/brand/midscene-icon.png"
          alt=""
          aria-hidden="true"
        />
        <strong>{score}</strong>
        <span>{details}</span>
      </div>
      <div className="home-benchmark-card__content">
        <h3>{title}</h3>
      </div>
    </TiltCard>
  );
}

export function FeatureSections() {
  const t = useI18n();

  return (
    <div className="home-features">
      <HomeChapter
        id="gui-agent"
        label={t('chapterAgent')}
        heading={t('agentChapterHeading')}
        description={t('agentChapterDesc')}
      >
        <AgentModels />

        <SectionDivider className="home-feature__divider" />

        <AgentBenchmarks />

        <SectionDivider className="home-feature__divider" />

        <AgentPlatforms />

        <SectionDivider className="home-feature__divider" />

        <AgentToolkit />
      </HomeChapter>
      <HomeChapter
        id="midscene-test"
        label={t('chapterFramework')}
        heading={t('frameworkChapterHeading')}
        description={t('frameworkChapterDesc')}
      >
        <TestFramework />
        <SectionDivider className="home-feature__divider" />
        <TestProject />
        <TestExecution />
      </HomeChapter>
    </div>
  );
}

export function AgentModels({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const tUrl = useI18nUrl();
  return (
    <FeatureSection
      eyebrow={t('modelsTitle')}
      heading={t('modelsHeading')}
      variant="models"
      hideHeading={hideHeading}
    >
      <div className="home-feature-grid">
        <FeatureCard
          href={tUrl('/model-common-config')}
          title={t('modelSupportedName')}
          description={t('modelSupportedDesc')}
          actionLabel={t('modelSupportedLink')}
          lightBackground="/images/models/supported-models-light.svg"
          darkBackground="/images/models/supported-models-dark.svg"
        />
        <FeatureCard
          href={tUrl('/app-control-bench-report')}
          title={t('modelCostName')}
          description={t('modelCostDesc')}
          actionLabel={t('modelCostReport')}
          lightBackground="/images/backgrounds/gradient-light.svg"
          darkBackground="/images/backgrounds/gradient-dark.svg"
          visualClassName="home-feature-card__visual--cost"
          lightContent={
            <div className="home-model-cost">
              <span className="home-model-cost__eyebrow">
                {t('modelCostExample')}
              </span>
              <div className="home-model-cost__amount">
                <strong>$0.59</strong>
                <span>{t('modelCostTasks')}</span>
              </div>
              <span>{t('modelCostMetric')}</span>
            </div>
          }
        />
      </div>
    </FeatureSection>
  );
}

export function AgentBenchmarks({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const tUrl = useI18nUrl();
  return (
    <FeatureSection
      eyebrow={t('benchmarksTitle')}
      heading={t('benchmarksHeading')}
      variant="benchmarks"
      hideHeading={hideHeading}
    >
      <div className="home-benchmark-grid">
        <BenchmarkLinkCard
          href={tUrl(t('featureBenchmarkLink'))}
          score="93.1%"
          title="AndroidWorld Benchmark"
          details={`${t('benchmark')} 93.1% · Pass@3 97.4%`}
        />
        <BenchmarkLinkCard
          href={tUrl(t('featureMobileWorldBenchmarkLink'))}
          score="78.6%"
          title="MobileWorld Benchmark"
          details={`${t('benchmark')} 78.6% · 92/117`}
        />
        <BenchmarkLinkCard
          href={tUrl(t('featureAppControlBenchLink'))}
          score="96.7%"
          title="AppControlBench Benchmark"
          details="Pass@1 96.7% · 58 PASS"
        />
      </div>
    </FeatureSection>
  );
}

export function AgentPlatforms({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  return (
    <FeatureSection
      eyebrow={t('clientsTitle')}
      heading={t('clientsHeading')}
      variant="platforms"
      hideHeading={hideHeading}
    >
      <PlatformTable />
    </FeatureSection>
  );
}

export function AgentToolkit({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  return (
    <FeatureSection
      eyebrow={t('debuggingTitle')}
      heading={t('debuggingHeading')}
      descriptions={[t('agentIntegrationDesc')]}
      variant="toolkit"
      hideHeading={hideHeading}
    >
      <TestingToolkit />
    </FeatureSection>
  );
}

export function TestExecution({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const tUrl = useI18nUrl();
  return (
    <section className="home-feature">
      <div className="home-feature__inner">
        {!hideHeading && (
          <header className="home-feature__heading-block">
            <span className="home-feature__eyebrow">
              {t('executionEyebrow')}
            </span>
            <h2>{t('executionHeading')}</h2>
          </header>
        )}
        <div className="home-execution-grid">
          {(
            [
              ['executionLifecycleTitle', 'executionLifecycleDesc'],
              ['executionRetryTitle', 'executionRetryDesc'],
              ['executionConcurrencyTitle', 'executionConcurrencyDesc'],
              ['executionReportTitle', 'executionReportDesc'],
            ] as const
          ).map(([title, description]) => (
            <article key={title}>
              <h3>{t(title)}</h3>
              <p>{t(description)}</p>
            </article>
          ))}
        </div>
        <Link
          className="home-feature__action"
          href={tUrl('/midscene-test/use')}
        >
          {t('frameworkStartLink')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
