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
        {steps.map(({ icon: Icon, title, description }) => (
          <li key={title}>
            <span className="agent-vision-steps__icon" aria-hidden="true">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="agent-vision-steps__text">
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link className="agent-vision-steps__link" href={tUrl('/showcases')}>
        {t('visionShowcaseLink')}
        <ArrowRight size={14} strokeWidth={1.5} />
      </Link>
    </div>
  );
}
