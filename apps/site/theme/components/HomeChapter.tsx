import type { ReactNode } from 'react';
import './HomeChapter.css';

export function HomeChapter({
  id,
  label,
  heading,
  description,
  children,
}: {
  id: string;
  label: string;
  heading: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="home-chapter" aria-labelledby={`${id}-title`}>
      <header className="home-chapter__header">
        <span className="home-chapter__label">{label}</span>
        <h2 id={`${id}-title`}>{heading}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
