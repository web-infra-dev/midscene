import { Braces, History, Workflow } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import { FeatureCard } from './FeatureCard';
import './TestingToolkit.css';

export function TestingToolkit() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const cards = [
    {
      title: t('toolkitFrameworkTitle'),
      description: t('toolkitFrameworkDesc'),
      href: '/midscene-test/overview',
      Icon: Workflow,
      label: 'YAML + TypeScript',
    },
    {
      title: t('toolkitApiTitle'),
      description: t('toolkitApiDesc'),
      href: '/reference/',
      Icon: Braces,
      label: `${t('toolkitPlan')} · ${t('toolkitAction')} · ${t('toolkitQuery')}`,
    },
    {
      title: t('toolkitReportTitle'),
      description: t('toolkitReportDesc'),
      href: '/midscene-test/use',
      Icon: History,
      label: 'Report · Replay · Playground',
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
