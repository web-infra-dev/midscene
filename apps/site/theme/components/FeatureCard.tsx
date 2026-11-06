import { Link } from '@rspress/core/theme-original';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import './FeatureCard.css';

interface FeatureCardProps {
  href: string;
  title: string;
  description: string;
  actionLabel: string;
  wide?: boolean;
  children: ReactNode;
}

export function FeatureCard({
  href,
  title,
  description,
  actionLabel,
  wide = false,
  children,
}: FeatureCardProps) {
  return (
    <Link href={href} className={`home-card${wide ? ' home-card--wide' : ''}`}>
      <div className="home-card__visual" aria-hidden="true">
        {children}
      </div>
      <div className="home-card__content">
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="home-card__action">
          {actionLabel}
          <ArrowRight size={14} strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}

export function FeatureCardGrid({
  columns = 2,
  children,
}: { columns?: 2 | 3; children: ReactNode }) {
  return (
    <div className={`home-card-grid home-card-grid--${columns}`}>
      {children}
    </div>
  );
}

/** Light and dark variants of an image that fills the card visual. */
export function FeatureCardImage({
  light,
  dark,
}: { light: string; dark: string }) {
  return (
    <>
      <img
        className="home-card__image home-card__image--light"
        src={light}
        alt=""
      />
      <img
        className="home-card__image home-card__image--dark"
        src={dark}
        alt=""
      />
    </>
  );
}
