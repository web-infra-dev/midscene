import { Bot, Braces, History } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import { FeatureCard, FeatureCardGrid } from './FeatureCard';
import './TestingToolkit.css';

export function TestingToolkit() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const cards = [
    {
      title: t('toolkitApiTitle'),
      action: t('toolkitApiLink'),
      description: t('toolkitApiDesc'),
      href: '/reference/',
      Icon: Braces,
      label: t('toolkitApiMetric'),
    },
    {
      title: t('toolkitReportTitle'),
      action: t('toolkitReportLink'),
      description: t('toolkitReportDesc'),
      href: '/midscene-test/use',
      Icon: History,
      label: 'Report · Replay · Playground',
    },
    {
      title: t('toolkitSkillsTitle'),
      action: t('toolkitSkillsLink'),
      description: t('toolkitSkillsDesc'),
      href: '/skills',
      Icon: Bot,
      label: 'Skills · GUI Automation',
    },
  ];
  return (
    <FeatureCardGrid columns={3}>
      {cards.map(({ title, description, href, Icon, label, action }) => (
        <FeatureCard
          key={href}
          href={tUrl(href)}
          title={title}
          description={description}
          actionLabel={action}
        >
          <div className="home-toolkit-visual">
            <Icon size={56} strokeWidth={1} />
            <span>{label}</span>
          </div>
        </FeatureCard>
      ))}
    </FeatureCardGrid>
  );
}
