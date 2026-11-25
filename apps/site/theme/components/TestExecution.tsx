import { Link } from '@rspress/core/theme-original';
import {
  ArrowUpRight,
  Cpu,
  FileJson,
  GitPullRequest,
  Layers,
  type LucideIcon,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import './TestExecution.css';

interface Capability {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

export function TestExecution({
  hideHeading = false,
}: { hideHeading?: boolean }) {
  const t = useI18n();
  const tUrl = useI18nUrl();

  const capabilities: Capability[] = [
    {
      icon: Layers,
      title: t('executionProjectsTitle'),
      description: t('executionProjectsDesc'),
      href: t('executionProjectsHref'),
    },
    {
      icon: Cpu,
      title: t('executionConcurrencyTitle'),
      description: t('executionConcurrencyShortDesc'),
      href: t('executionConcurrencyHref'),
    },
    {
      icon: ShieldCheck,
      title: t('executionLifecycleTitle'),
      description: t('executionLifecycleShortDesc'),
      href: t('executionLifecycleHref'),
    },
    {
      icon: RotateCcw,
      title: t('executionRetryTitle'),
      description: t('executionRetryShortDesc'),
      href: t('executionRetryHref'),
    },
    {
      icon: GitPullRequest,
      title: t('executionCiTitle'),
      description: t('executionCiDesc'),
      href: t('executionCiHref'),
    },
    {
      icon: FileJson,
      title: t('executionAiOutputTitle'),
      description: t('executionAiOutputDesc'),
      href: t('executionAiOutputHref'),
    },
  ];

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

        <div className="exec-grid">
          {capabilities.map(({ icon: Icon, title, description, href }) => (
            <Link key={title} href={tUrl(href)} className="exec-grid__item">
              <div className="exec-grid__head">
                <span className="exec-grid__icon" aria-hidden="true">
                  <Icon size={15} strokeWidth={1.6} />
                </span>
                <h3>{title}</h3>
                <ArrowUpRight
                  className="exec-grid__arrow"
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
              <p>{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
