import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import './HomeSdk.css';

export function NextSteps() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const links = [
    {
      href: '/quick-start',
      path: 'quick-start',
      title: t('nextQuickStartTitle'),
      desc: t('nextQuickStartDesc'),
    },
    {
      href: '/midscene-test/use',
      path: 'midscene-test',
      title: t('frameworkStartLink'),
      desc: t('nextTestDesc'),
    },
    {
      href: '/skills',
      path: 'skills',
      title: 'Midscene Skills',
      desc: t('nextSkillsDesc'),
    },
    {
      href: '/basics',
      path: 'basics',
      title: t('nextBasicsTitle'),
      desc: t('nextBasicsDesc'),
    },
  ];

  return (
    <div className="home-sdk-grid home-sdk-grid--2">
      {links.map((link) => (
        <Link
          key={link.href}
          className="home-sdk-card home-sdk-card--link"
          href={tUrl(link.href)}
        >
          <code className="home-sdk-card__package">/{link.path}</code>
          <strong>
            {link.title}
            <ArrowRight size={16} aria-hidden="true" />
          </strong>
          <span>{link.desc}</span>
        </Link>
      ))}
    </div>
  );
}
