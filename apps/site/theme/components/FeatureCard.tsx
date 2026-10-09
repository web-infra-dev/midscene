import type { ReactNode } from 'react';
import { TiltCard } from './TiltCard';

interface FeatureCardProps {
  href: string;
  title: string;
  description: string;
  actionLabel?: string;
  lightBackground: string;
  darkBackground: string;
  visualClassName?: string;
  lightContent?: ReactNode;
  darkContent?: ReactNode;
}

export function FeatureCard({
  href,
  title,
  description,
  actionLabel,
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
        {actionLabel && (
          <span className="home-feature-card__action">
            {actionLabel}
            <span aria-hidden="true"> →</span>
          </span>
        )}
      </div>
    </TiltCard>
  );
}
