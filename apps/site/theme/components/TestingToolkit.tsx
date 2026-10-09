import { Bot, Braces, History } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import { FeatureCard } from './FeatureCard';
import './TestingToolkit.css';

export function TestingToolkit() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const cards = [
    {
      title: t('toolkitApiTitle'),
      description: t('toolkitApiDesc'),
      href: '/reference/',
      Icon: Braces,
      label: t('toolkitApiMetric'),
    },
    {
      title: t('toolkitReportTitle'),
      description: t('toolkitReportDesc'),
      href: '/midscene-test/use',
      Icon: History,
      label: 'Report · Replay · Playground',
    },
    {
      title: t('toolkitSkillsTitle'),
      description: t('toolkitSkillsDesc'),
      href: '/skills',
      Icon: Bot,
      label: 'Skills · GUI Automation',
    },
  ];
  return (
    <div className="home-feature-grid home-toolkit-grid">
      {cards.map(({ title, description, href, Icon, label }) => (
        <FeatureCard
          key={href}
          href={tUrl(href)}
          title={title}
          description={description}
          lightBackground="/images/backgrounds/gradient-light.svg"
          darkBackground="/images/backgrounds/gradient-dark.svg"
          lightContent={
            <div className="home-model-visual home-toolkit-visual">
              <Icon size={72} strokeWidth={1} />
              <span>{label}</span>
            </div>
          }
        />
      ))}
    </div>
  );
}
