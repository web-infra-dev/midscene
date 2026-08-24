import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';

interface CTAButtonsProps {
  variant?: 'default' | 'hero';
}

export function CTAButtons({ variant = 'default' }: CTAButtonsProps) {
  const t = useI18n();
  const tUrl = useI18nUrl();

  if (variant === 'hero') {
    return (
      <div className="home-hero__actions">
        <Link
          href={tUrl('/introduction')}
          className="home-hero__button home-hero__button--primary"
        >
          <span>{t('introduction')}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
        <Link
          href={tUrl('/showcases')}
          className="home-hero__button home-hero__button--secondary"
        >
          <span>{t('whatsNew')}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="home-hero__actions home-bottom-cta__actions">
      <Link
        href={tUrl('/introduction')}
        className="home-hero__button home-hero__button--primary"
      >
        <span>{t('introduction')}</span>
        <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
      </Link>
      <Link
        href={tUrl('/showcases')}
        className="home-hero__button home-hero__button--secondary"
      >
        <span>{t('whatsNew')}</span>
        <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </div>
  );
}
