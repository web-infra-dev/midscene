import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n, useI18nUrl } from '../i18n';
import { SectionDivider } from './SectionDivider';
import { TiltCard } from './TiltCard';

interface FeatureSectionProps {
  eyebrow: string;
  heading: string;
  descriptions: string[];
  variant: 'platforms' | 'toolkit' | 'benchmarks' | 'start';
  action?: {
    href: string;
    label: string;
    description?: string;
  };
  children: ReactNode;
}

function FeatureSection({
  eyebrow,
  heading,
  descriptions,
  variant,
  action,
  children,
}: FeatureSectionProps) {
  return (
    <section className={`home-feature home-feature--${variant}`}>
      <div className="home-feature__inner">
        <header className="home-feature__header">
          <div className="home-feature__heading-block">
            <span className="home-feature__eyebrow">
              <span aria-hidden="true">{'//'}</span>
              <span>{eyebrow}</span>
            </span>
            <h2>{heading}</h2>
          </div>

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
                <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            )}
          </div>
        </header>

        {children}
      </div>
    </section>
  );
}

interface FeatureCardProps {
  href: string;
  title: string;
  description: string;
  lightBackground: string;
  darkBackground: string;
  visualClassName?: string;
  lightContent?: ReactNode;
  darkContent?: ReactNode;
}

function FeatureCard({
  href,
  title,
  description,
  lightBackground,
  darkBackground,
  visualClassName,
  lightContent,
  darkContent,
}: FeatureCardProps) {
  return (
    <TiltCard href={href} className="home-feature-card">
      <div
        className={`home-feature-card__visual${visualClassName ? ` ${visualClassName}` : ''}`}
        aria-hidden="true"
      >
        <div
          className="home-feature-card__theme home-feature-card__theme--light"
          style={{ backgroundImage: `url(${lightBackground})` }}
        >
          {lightContent}
        </div>
        <div
          className="home-feature-card__theme home-feature-card__theme--dark"
          style={{ backgroundImage: `url(${darkBackground})` }}
        >
          {darkContent ?? lightContent}
        </div>
      </div>
      <div className="home-feature-card__content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </TiltCard>
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
          src="/midscene-icon.png"
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
  const tUrl = useI18nUrl();

  return (
    <div className="home-features">
      <FeatureSection
        eyebrow={t('clientsTitle')}
        heading={t('clientsHeading')}
        descriptions={[t('clientsDesc1'), t('clientsDesc2'), t('clientsDesc3')]}
        variant="platforms"
      >
        <div className="home-copy-grid home-copy-grid--two">
          {(
            [
              {
                title: 'visualActionTitle',
                description: 'visualActionDesc',
                example: 'visualActionExample',
                method: 'aiAct',
              },
              {
                title: 'visualAssertTitle',
                description: 'visualAssertDesc',
                example: 'visualAssertExample',
                method: 'aiAssert',
              },
            ] as const
          ).map(({ title, description, example, method }) => (
            <article className="home-copy-card" key={title}>
              <h3>{t(title)}</h3>
              <p>{t(description)}</p>
              <code>{`await agent.${method}(${JSON.stringify(t(example))});`}</code>
            </article>
          ))}
        </div>
        <div className="home-feature-grid home-feature-grid--platforms">
          <FeatureCard
            href={tUrl(t('platformWebLink'))}
            title={t('platformWeb')}
            description={t('platformWebDesc')}
            lightBackground="/images/backgrounds/gradient-light.svg"
            darkBackground="/images/backgrounds/gradient-dark.svg"
            lightContent={
              <img
                src="/images/platforms/web-light.png"
                alt=""
                className="home-feature-card__asset home-feature-card__asset--web"
              />
            }
            darkContent={
              <img
                src="/images/platforms/web-dark.png"
                alt=""
                className="home-feature-card__asset home-feature-card__asset--web"
              />
            }
          />
          <FeatureCard
            href={tUrl(t('platformPCLink'))}
            title={t('platformPC')}
            description={t('platformPCDesc')}
            lightBackground="/images/backgrounds/gradient-light.svg"
            darkBackground="/images/backgrounds/gradient-dark.svg"
            lightContent={
              <img
                src="/images/platforms/pc-light.svg"
                alt=""
                className="home-feature-card__asset home-feature-card__asset--pc"
              />
            }
            darkContent={
              <img
                src="/images/platforms/pc-dark.svg"
                alt=""
                className="home-feature-card__asset home-feature-card__asset--pc"
              />
            }
          />
          <FeatureCard
            href={tUrl(t('platformMobileLink'))}
            title={t('platformMobile')}
            description={t('platformMobileDesc')}
            lightBackground="/images/backgrounds/gradient-light.svg"
            darkBackground="/images/backgrounds/gradient-dark.svg"
            lightContent={
              <div className="home-feature-card__phones">
                <img src="/images/platforms/android-light.png" alt="" />
                <img src="/images/platforms/ios-light.png" alt="" />
              </div>
            }
            darkContent={
              <div className="home-feature-card__phones">
                <img src="/images/platforms/android-dark.png" alt="" />
                <img src="/images/platforms/ios-dark.png" alt="" />
              </div>
            }
          />
          <FeatureCard
            href={tUrl(t('platformAnyInterfaceLink'))}
            title={t('platformAnyInterface')}
            description={t('platformAnyInterfaceDesc')}
            lightBackground="/images/backgrounds/gradient-light.svg"
            darkBackground="/images/backgrounds/gradient-dark.svg"
            lightContent={
              <img
                src="/images/platforms/any-interface-light.png"
                alt=""
                className="home-feature-card__asset home-feature-card__asset--interface"
              />
            }
            darkContent={
              <img
                src="/images/platforms/any-interface-dark.png"
                alt=""
                className="home-feature-card__asset home-feature-card__asset--interface"
              />
            }
          />
        </div>
      </FeatureSection>

      <SectionDivider className="home-feature__divider" />
      <FeatureSection
        eyebrow={t('benchmarksTitle')}
        heading={t('benchmarksHeading')}
        descriptions={[t('benchmarksDesc'), t('modelNote')]}
        variant="benchmarks"
        action={{ href: tUrl('/model-strategy'), label: t('modelLinkLabel') }}
      >
        <div className="home-benchmark-grid">
          <BenchmarkLinkCard
            href={tUrl(t('featureBenchmarkLink'))}
            score="93.1%"
            title="AndroidWorld · Pass@1"
            details="Gemini-3.5-Flash"
          />
          <BenchmarkLinkCard
            href={tUrl(t('featureMobileWorldBenchmarkLink'))}
            score="78.6%"
            title="MobileWorld · Pass@1"
            details="Gemini-3.6-Flash"
          />
          <BenchmarkLinkCard
            href={tUrl(t('featureAppControlBenchLink'))}
            score="96.7%"
            title="AppControlBench · Pass@1"
            details="Doubao Seed 2.1 Turbo"
          />
          <BenchmarkLinkCard
            href={tUrl(t('featureAppControlBenchLink'))}
            score="$0.59"
            title={t('costTitle')}
            details={t('costDetails')}
          />
        </div>
      </FeatureSection>
      <SectionDivider className="home-feature__divider" />
      <FeatureSection
        eyebrow={t('debuggingTitle')}
        heading={t('debuggingHeading')}
        descriptions={[
          t('debuggingDesc1'),
          t('debuggingDesc2'),
          t('debuggingDesc3'),
        ]}
        variant="toolkit"
      >
        <div className="home-copy-grid home-copy-grid--three">
          {(
            [
              {
                title: 'observeTitle',
                description: 'observeDesc',
                href: '/midscene-test/use',
                asset: 'reports-playground',
              },
              {
                title: 'testTitle',
                description: 'testDesc',
                href: '/midscene-test/overview',
                asset: 'flexible-integration',
              },
              {
                title: 'integrateTitle',
                description: 'integrateDesc',
                href: '/integrate-with-playwright',
                asset: 'rich-apis',
              },
            ] as const
          ).map(({ title, description, href, asset }) => (
            <Link className="home-copy-card" href={tUrl(href)} key={title}>
              <img
                className="home-copy-card__icon"
                src={`/images/toolkit/${asset}.svg`}
                alt=""
              />
              <h3>{t(title)}</h3>
              <p>{t(description)}</p>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </FeatureSection>
      <SectionDivider className="home-feature__divider" />
      <FeatureSection
        eyebrow={t('startTitle')}
        heading={t('startHeading')}
        descriptions={[t('startDesc')]}
        variant="start"
      >
        <div className="home-copy-grid home-copy-grid--four">
          {(
            [
              {
                title: 'startPlayground',
                description: 'startPlaygroundDesc',
                href: '/quick-start',
              },
              {
                title: 'startTest',
                description: 'startTestDesc',
                href: '/midscene-test/extend',
              },
              {
                title: 'startSDK',
                description: 'startSDKDesc',
                href: '/integrate-with-playwright',
              },
              {
                title: 'startSkills',
                description: 'startSkillsDesc',
                href: '/skills',
              },
            ] as const
          ).map(({ title, description, href }) => (
            <Link className="home-copy-card" href={tUrl(href)} key={title}>
              <h3>{t(title)}</h3>
              <p>{t(description)}</p>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </FeatureSection>
      <SectionDivider className="home-feature__divider" />
    </div>
  );
}
