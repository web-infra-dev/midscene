import { Link } from '@rspress/core/theme-original';
import { ArrowRight, CircleCheck, Eye, MousePointerClick } from 'lucide-react';
import { useI18n, useI18nUrl } from '../i18n';
import './AgentVision.css';

export function AgentVisionSteps() {
  const t = useI18n();
  const tUrl = useI18nUrl();
  const steps = [
    {
      icon: Eye,
      title: t('visionStepObserve'),
      description: t('visionStepObserveDesc'),
    },
    {
      icon: MousePointerClick,
      title: t('visionStepAct'),
      description: t('visionStepActDesc'),
    },
    {
      icon: CircleCheck,
      title: t('visionStepVerify'),
      description: t('visionStepVerifyDesc'),
    },
  ];

  return (
    <div className="agent-vision-steps">
      <ol>
        {steps.map(({ icon: Icon, title, description }, index) => (
          <li key={title}>
            <span className="agent-vision-steps__index" aria-hidden="true">
              0{index + 1}
            </span>
            <span className="agent-vision-steps__icon" aria-hidden="true">
              <Icon size={16} strokeWidth={1.6} />
            </span>
            <span className="agent-vision-steps__text">
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link className="agent-vision-steps__link" href={tUrl('/showcases')}>
        <span>{t('visionShowcaseLink')}</span>
        <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
      </Link>
    </div>
  );
}
