import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n, useI18nUrl } from '../i18n';
import { FeatureCard, FeatureCardGrid, FeatureCardImage } from './FeatureCard';
import { HomeChapter } from './HomeChapter';
import { PlatformHub } from './PlatformHub';
import { SectionDivider } from './SectionDivider';
import { TestExecution } from './TestExecution';
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
      <FeatureCardGrid>
        <FeatureCard
          href={tUrl('/model-selection')}
          title={t('modelSupportedName')}
          description={t('modelSupportedDesc')}
          actionLabel={t('modelSupportedLink')}
        >
          <FeatureCardImage
            light="/images/models/supported-models-light.svg"
            dark="/images/models/supported-models-dark.svg"
          />
        </FeatureCard>
        <FeatureCard
          href={tUrl('/app-control-bench-report')}
          title={t('modelCostName')}
          description={t('modelCostDesc')}
          actionLabel={t('modelCostReport')}
        >
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
        </FeatureCard>
      </FeatureCardGrid>
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
      <PlatformHub />
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
